const STORAGE_KEY = "hideViewedJobs";
const HIDDEN_CLASS = "hlv-hidden-job";

// LinkedIn changes class names regularly. Data attributes and job links are
// more stable, so selectors below are used together instead of relying on one
// CSS class.
const JOB_CARD_SELECTORS = [
  "div[role='button'][componentkey^='job-card-component-ref-']",
  "[data-occludable-job-id]",
  "[data-job-id]:not(a)",
  "li.jobs-search-results__list-item",
  "li.scaffold-layout__list-item",
  "li.discovery-templates-entity-item",
  "li[class*='discovery-templates-entity-item']",
  "article.job-search-card",
  "div.job-search-card",
  "div.base-card",
  "article.base-card",
  "li.jobs-collections-module__list-item",
  "div.jobs-collections-module__list-item",
  "li.jobs-collection__list-item",
  "div.jobs-collection__list-item",
  ".jobs-collections-module__job-card",
  ".jobs-collections-module__job-card-container",
  ".job-card-list",
  ".base-card",
  ".job-search-card",
  ".job-card-container",
  "li[class*='jobs-search']",
  "li[class*='job-card']",
  "div[class*='job-card']",
  "article[class*='job']",
  "article[class*='base-card']"
];

const JOB_CARD_SELECTOR = JOB_CARD_SELECTORS.join(",");

// This is the card shape in the saved LinkedIn results page. Keep it separate
// because it is more reliable than the hashed CSS classes around it.
const PRIMARY_JOB_CARD_SELECTOR =
  "div[role='button'][componentkey^='job-card-component-ref-']";

const JOB_LINK_SELECTOR = [
  "a[href*='/jobs/view/']",
  "a[href*='/jobs/collections/']",
  "a[href*='/jobs/collections/recommended']",
  "a[href*='/jobs/search/']",
  "a[href*='currentJobId=']",
  "a[href*='trk=public_jobs']",
  "a.job-card-container__link",
  "a[data-control-name*='job']",
  "a[class*='job-card']",
  "a.base-card__full-link",
  "a.jobs-collection-card__link",
  "a.jobs-collections-module__link"
].join(",");

const VIEWED_LABELS = new Set([
  "viewed",
  "seen",
  "已查看",
  "已浏览",
  "已查閱",
  "已檢視",
  "görüntülenen",
  "gesehen",
  "visualizado",
  "visualizzato",
  "bekeken"
]);

const VIEWED_STATE_SELECTORS = [
  "[data-viewed='true']",
  "[data-jobstate]",
  "li.job-card-container__footer-job-state",
  "li[class*='footer-job-state']",
  ".job-card-container__footer-wrapper li",
  "[class*='job-card-footer']",
  "[class*='job-state']",
  "span.job-card-list__footer"
];

const FALLBACK_CARD_SELECTOR = [
  PRIMARY_JOB_CARD_SELECTOR,
  "[data-job-id]",
  ".job-card-container",
  ".job-card-list",
  ".base-card",
  ".job-search-card",
  "li[class*='jobs-search']",
  "li[class*='job-card']",
  "div[class*='job-card']",
  "article[class*='job']",
  "article[class*='base-card']",
  "li",
  "article",
  "[role='listitem']"
].join(",");

// This set only lives inside the current page. 
// A refresh creates a new content script and clears it
const protectedJobIds = new Set();
const protectedJobCards = new WeakSet();

let hidingEnabled = true;
let temporarilyShowing = false;
let scanScheduled = false;

function normalizeText(text = "") {
  return String(text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function hasViewedLabel(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return false;
  }

  return Array.from(VIEWED_LABELS).some((label) => {
    return (
      normalized === label ||
      normalized.startsWith(`${label} `) ||
      normalized.endsWith(` ${label}`) ||
      normalized.includes(` ${label} `) ||
      (!/^[a-z]/.test(label) && normalized.includes(label))
    );
  });
}

function elementHasViewedMarker(element) {
  const viewedValue = normalizeText(element.getAttribute("data-viewed"));
  const stateValue = normalizeText(element.getAttribute("data-jobstate"));

  return (
    viewedValue === "true" ||
    viewedValue === "1" ||
    hasViewedLabel(stateValue) ||
    hasViewedLabel(element.getAttribute("aria-label")) ||
    hasViewedLabel(element.getAttribute("title")) ||
    hasViewedLabel(element.textContent)
  );
}

function isViewedJob(card) {
  const stateElements = card.querySelectorAll(
    VIEWED_STATE_SELECTORS.join(",")
  );

  for (const element of stateElements) {
    if (elementHasViewedMarker(element)) {
      return true;
    }
  }

  // The status can also be rendered as an aria label, title, or a small
  // element whose tag name changes between LinkedIn layouts.
  const markerElements = card.querySelectorAll(
    "[aria-label], [title], span, small, div, p, time"
  );
  for (const element of markerElements) {
    if (elementHasViewedMarker(element)) {
      return true;
    }
  }

  return false;
}

function findCardFromJobLink(link) {
  const knownCard = link.closest(JOB_CARD_SELECTOR);
  if (knownCard) {
    return knownCard;
  }

  let candidate = link.parentElement;
  while (candidate && candidate !== document.body) {
    if (candidate.matches(FALLBACK_CARD_SELECTOR)) {
      return candidate;
    }
    candidate = candidate.parentElement;
  }

  // Last resort: hide the link itself, never the whole page. This keeps an
  // unexpected LinkedIn wrapper from making the extension hide <body>.
  return link;
}

function findJobCards(root = document) {
  const cards = new Set();

  // The current LinkedIn results page exposes exactly one outer card with
  // this component key. Include these directly even if its inner links are
  // rendered asynchronously.
  for (const card of root.querySelectorAll(PRIMARY_JOB_CARD_SELECTOR)) {
    cards.add(card);
  }

  // A job link is the most reliable anchor across LinkedIn layouts. Resolve
  // each link to its nearest visual card and deduplicate the result.
  for (const link of root.querySelectorAll(JOB_LINK_SELECTOR)) {
    const card = findCardFromJobLink(link);
    if (card) {
      cards.add(card);
    }
  }

  return Array.from(cards).filter((card) => hasJobReference(card));
}

function findOuterJobCard(element) {
  const link = element.closest(JOB_LINK_SELECTOR);
  return link
    ? findCardFromJobLink(link)
    : element.closest(PRIMARY_JOB_CARD_SELECTOR);
}

function hasJobReference(card) {
  return Boolean(
    card.matches(
      "[data-occludable-job-id], [data-job-id], [componentkey], " +
        JOB_LINK_SELECTOR
    ) ||
      card.querySelector(
        "[data-occludable-job-id], [data-job-id], [componentkey], " +
          JOB_LINK_SELECTOR
      )
  );
}

function getJobId(card) {
  const elementWithId = card.matches("[data-occludable-job-id], [data-job-id]")
    ? card
    : card.querySelector("[data-occludable-job-id], [data-job-id]");

  const dataId =
    elementWithId?.getAttribute("data-occludable-job-id") ??
    elementWithId?.getAttribute("data-job-id");

  if (dataId) {
    return String(dataId);
  }

  const componentKeyElement = card.matches("[componentkey]")
    ? card
    : card.querySelector("[componentkey]");
  const componentId = componentKeyElement
    ?.getAttribute("componentkey")
    ?.match(/job-card-component-ref-(\d+)/)?.[1];

  if (componentId) {
    return componentId;
  }

  const jobLink = card.matches(JOB_LINK_SELECTOR)
    ? card
    : card.querySelector(JOB_LINK_SELECTOR);
  if (!jobLink) {
    return null;
  }

  try {
    const url = new URL(jobLink.href, window.location.href);
    return (
      url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] ??
      url.searchParams.get("currentJobId")
    );
  } catch {
    return null;
  }
}

function protectJobUntilRefresh(card) {
  const jobId = getJobId(card);

  if (jobId) {
    protectedJobIds.add(jobId);
  } else {
    // Fallback for a LinkedIn layout that does not expose a job ID.
    protectedJobCards.add(card);
  }
}

function isProtectedJob(card) {
  const jobId = getJobId(card);
  return protectedJobCards.has(card) || (jobId && protectedJobIds.has(jobId));
}

function updateJobCards() {
  const shouldHide = hidingEnabled && !temporarilyShowing;

  for (const card of findJobCards()) {
    const hideCard = shouldHide && isViewedJob(card) && !isProtectedJob(card);
    card.classList.toggle(HIDDEN_CLASS, hideCard);
  }
}

function getStats() {
  const cards = findJobCards();
  let viewed = 0;
  let hidden = 0;

  for (const card of cards) {
    if (isViewedJob(card)) {
      viewed += 1;
    }
    if (card.classList.contains(HIDDEN_CLASS)) {
      hidden += 1;
    }
  }

  return {
    cards: cards.length,
    viewed,
    hidden
  };
}

function scheduleScan() {
  if (scanScheduled) {
    return;
  }

  scanScheduled = true;
  window.setTimeout(() => {
    scanScheduled = false;
    updateJobCards();
  }, 100);
}

async function start() {
  const saved = await chrome.storage.local.get({
    [STORAGE_KEY]: true
  });

  hidingEnabled = saved[STORAGE_KEY];
  updateJobCards();

  // LinkedIn is a single-page app: more job cards arrive after the first load.
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "class", "data-jobstate", "data-viewed"]
  });

  // Some SPA updates change internal state without producing a useful DOM
  // mutation. A low-frequency scan makes those updates visible as well.
  window.setInterval(scheduleScan, 1500);
}

// Capture navigation before LinkedIn handles it and changes the label to
// Viewed. The protection lasts only until this content script is re-created by
// a full page refresh.
function protectClickedJob(event) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const clickedJobLink = event.target.closest(JOB_LINK_SELECTOR);
  let card = null;

  if (clickedJobLink) {
    card = findCardFromJobLink(clickedJobLink);
  } else {
    card = event.target.closest(PRIMARY_JOB_CARD_SELECTOR);

    // A job card can contain its own save/dismiss buttons. Those controls do
    // not mean the user opened the job, so do not protect the card for them.
    const nestedControl = event.target.closest(
      "a, button, input, select, textarea, [role='button']"
    );
    if (nestedControl && nestedControl !== card) {
      return;
    }
  }

  if (!card || isViewedJob(card)) {
    return;
  }

  protectJobUntilRefresh(card);
}

document.addEventListener("pointerdown", protectClickedJob, true);
document.addEventListener("click", protectClickedJob, true);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) {
    return;
  }

  hidingEnabled = changes[STORAGE_KEY].newValue;

  if (!hidingEnabled) {
    temporarilyShowing = false;
  }

  updateJobCards();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    sendResponse({
      hidingEnabled,
      temporarilyShowing,
      stats: getStats()
    });
    return;
  }

  if (message.type === "SET_TEMPORARY_SHOWING") {
    temporarilyShowing = message.value;
    updateJobCards();
    sendResponse({ ok: true });
  }
});

start();
