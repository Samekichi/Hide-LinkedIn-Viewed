const STORAGE_KEY = "hideViewedJobs";
const HIDDEN_CLASS = "hlv-hidden-job";

// Select whole cards, including the footer, in the two observed layouts.
const CARD_SELECTOR = [
  "li[data-occludable-job-id]",
  "div[role='button'][componentkey^='job-card-component-ref-']"
].join(",");
const VIEWED_LABELS = new Set([
  "viewed", "seen", "已查看", "已浏览", "已查閱", "已檢視",
  "görüntülenen", "gesehen", "visualizado", "visualizzato", "bekeken"
]);

// Memory belongs to this page only; refreshing clears the protection.
const protectedJobIds = new Set();
let hidingEnabled = true;
let temporarilyShowing = false;
let scanScheduled = false;

function findJobCards() {
  return Array.from(document.querySelectorAll(CARD_SELECTOR));
}

function getJobId(card) {
  return card.getAttribute("data-occludable-job-id") ||
    card.getAttribute("componentkey").replace("job-card-component-ref-", "");
}

function isViewedJob(card) {
  // Legacy cards use a footer li; componentkey cards use a plain p.
  return Array.from(card.querySelectorAll(
    ".job-card-container__footer-job-state, p, span"
  )).some((element) => VIEWED_LABELS.has(
    element.textContent.trim().replace(/\s+/g, " ").toLowerCase()
  ));
}

function updateJobCards() {
  for (const card of findJobCards()) {
    const hide = hidingEnabled && !temporarilyShowing &&
      isViewedJob(card) && !protectedJobIds.has(getJobId(card));
    // Avoid generating another class mutation when nothing changed.
    if (card.classList.contains(HIDDEN_CLASS) !== hide) {
      card.classList.toggle(HIDDEN_CLASS, hide);
    }
  }
}

function getStats() {
  const cards = findJobCards();
  return {
    cards: cards.length,
    viewed: cards.filter(isViewedJob).length,
    hidden: cards.filter((card) => card.classList.contains(HIDDEN_CLASS)).length
  };
}

function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  window.setTimeout(() => {
    scanScheduled = false;
    updateJobCards();
  }, 100);
}

function protectClickedJob(event) {
  if (!(event.target instanceof Element)) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  if (event.type === "pointerdown" && event.button !== 0) return;

  const card = event.target.closest(CARD_SELECTOR);
  if (!card || isViewedJob(card)) return;

  // Save/dismiss controls do not open the job. Title links and card clicks do.
  const control = event.target.closest("button, input, select, textarea, [role='button']");
  if (control && control !== card) return;
  const link = event.target.closest("a");
  if (link && !link.matches("a[href*='/jobs/view/'], a[href*='currentJobId=']")) return;
  protectedJobIds.add(getJobId(card));
}

document.addEventListener("pointerdown", protectClickedJob, true);
document.addEventListener("click", protectClickedJob, true);
document.addEventListener("keydown", protectClickedJob, true);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  hidingEnabled = changes[STORAGE_KEY].newValue ?? true;
  if (!hidingEnabled) temporarilyShowing = false;
  updateJobCards();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    sendResponse({ hidingEnabled, temporarilyShowing, stats: getStats() });
  }
  if (message.type === "SET_TEMPORARY_SHOWING") {
    temporarilyShowing = message.value === true;
    updateJobCards();
    sendResponse({ ok: true });
  }
});

async function start() {
  const saved = await chrome.storage.local.get({ [STORAGE_KEY]: true });
  hidingEnabled = saved[STORAGE_KEY];
  updateJobCards();

  // Covers appended cards, changed labels and recycled card identities.
  new MutationObserver(scheduleScan).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "data-occludable-job-id", "componentkey"]
  });
}

start().catch((error) => console.error("LinkedIn job filter failed to start:", error));
