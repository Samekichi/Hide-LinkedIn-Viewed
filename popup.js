const STORAGE_KEY = "hideViewedJobs";

const enabledInput = document.querySelector("#enabled");
const temporaryInput = document.querySelector("#temporary");
const statusElement = document.querySelector("#status");

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

async function sendToCurrentTab(message) {
  const tab = await getCurrentTab();

  if (!tab?.id || !tab.url?.startsWith("https://www.linkedin.com/jobs/")) {
    throw new Error("Please open LinkedIn Jobs page first");
  }

  return chrome.tabs.sendMessage(tab.id, message);
}

function syncTemporaryControl() {
  temporaryInput.disabled = !enabledInput.checked;

  if (!enabledInput.checked) {
    temporaryInput.checked = false;
  }
}

async function initialize() {
  const saved = await chrome.storage.local.get({
    [STORAGE_KEY]: true
  });

  enabledInput.checked = saved[STORAGE_KEY];
  syncTemporaryControl();

  try {
    const state = await sendToCurrentTab({ type: "GET_STATE" });
    temporaryInput.checked = state.temporarilyShowing;
    setStatus(
      `Connected: ${state.stats.cards} cards, ${state.stats.viewed} viewed`
    );
  } catch (error) {
    setStatus(error.message, true);
  }
}

enabledInput.addEventListener("change", async () => {
  await chrome.storage.local.set({
    [STORAGE_KEY]: enabledInput.checked
  });

  syncTemporaryControl();
  setStatus(enabledInput.checked ? "Auto-hide Enabled" : "Auto-hide Disabled");
});

temporaryInput.addEventListener("change", async () => {
  try {
    await sendToCurrentTab({
      type: "SET_TEMPORARY_SHOWING",
      value: temporaryInput.checked
    });
    setStatus(temporaryInput.checked ? "Restored hidden viewed posts on current tab" : "Re-hidden viewed posts");
  } catch (error) {
    temporaryInput.checked = false;
    setStatus(error.message, true);
  }
});

initialize();
