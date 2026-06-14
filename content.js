const STORAGE_KEY = "hideViewedJobs";
const HIDDEN_CLASS = "hlv-hidden-job";

// Keep several selectors for constantly-changing LinkedIn page
const JOB_CARD_SELECTORS = [
  "li[data-occludable-job-id]",
  ".jobs-search-results__list-item",
  ".job-card-container",
  "[data-job-id]"
];

const VIEWED_LABELS = new Set([
  "viewed"
]);

// This set only lives inside the current page. 
// A refresh creates a new content script and clears it
const protectedJobIds = new Set();
const protectedJobCards = new WeakSet();

let hidingEnabled = true;
let temporarilyShowing = false;
let scanScheduled = false;

function normalizeText(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function isViewedJob(card) {
  const textElements = card.querySelectorAll("span, li, p");

  return Array.from(textElements).some((element) => {
    return VIEWED_LABELS.has(normalizeText(element.textContent));
  });
}

function findJobCards(root = document) {
  const selector = JOB_CARD_SELECTORS.join(",");
  const matches = Array.from(root.querySelectorAll(selector));

  // Some LinkedIn layouts put a matching element inside another matching
  // element. Keeping only the outer card avoids processing one job twice.
  return matches.filter((card) => !card.parentElement?.closest(selector));
}

function findOuterJobCard(element) {
  const selector = JOB_CARD_SELECTORS.join(",");
  let card = element.closest(selector);

  if (!card) {
    return null;
  }

  let outerCard = card.parentElement?.closest(selector);
  while (outerCard) {
    card = outerCard;
    outerCard = card.parentElement?.closest(selector);
  }

  return card;
}

function getJobId(card) {
  const elementWithId = card.matches("[data-occludable-job-id], [data-job-id]")
    ? card
    : card.querySelector("[data-occludable-job-id], [data-job-id]");

  const dataId =
    elementWithId?.getAttribute("data-occludable-job-id") ??
    elementWithId?.getAttribute("data-job-id");

  if (dataId) {
    return dataId;
  }

  const jobLink = card.querySelector('a[href*="/jobs/view/"]');
  return jobLink?.href.match(/\/jobs\/view\/(\d+)/)?.[1] ?? null;
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
    subtree: true
  });
}

// Capture the click before LinkedIn handles it and changes the label to Viewed.
document.addEventListener(
  "click",
  (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const card = findOuterJobCard(event.target);
    if (!card || isViewedJob(card)) {
      return;
    }

    protectJobUntilRefresh(card);
  },
  true
);

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
      temporarilyShowing
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
