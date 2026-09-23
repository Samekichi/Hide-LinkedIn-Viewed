// Run: node tests/content.test.cjs <path-to-jsdom> <saved-page.html>
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require(process.argv[2]);
const source = fs.readFileSync(path.join(__dirname, "../content.js"), "utf8");
const html = process.argv[3] ? fs.readFileSync(process.argv[3], "utf8") :
  '<ul><li data-occludable-job-id="1"><div><ul><li class="job-card-container__footer-job-state">Viewed</li></ul></div></li>' +
  '<li data-occludable-job-id="2"><p>Posted today</p></li></ul>';
const pause = () => new Promise((resolve) => setTimeout(resolve, 250));

async function main() {
  // outside-only prevents scripts in the saved page from executing.
  const dom = new JSDOM(html, {
    url: "https://www.linkedin.com/jobs/search/",
    runScripts: "outside-only"
  });
  const w = dom.window;
  let message;
  let storageChange;
  w.chrome = {
    storage: {
      local: { get: async () => ({ hideViewedJobs: true }) },
      onChanged: { addListener: (fn) => { storageChange = fn; } }
    },
    runtime: { onMessage: { addListener: (fn) => { message = fn; } } }
  };
  const send = (data) => {
    let response;
    message(data, {}, (value) => { response = value; });
    return response;
  };
  const hidden = (card) => card.classList.contains("hlv-hidden-job");
  try {
    const cards = [...w.document.querySelectorAll("li[data-occludable-job-id]")];
    const viewed = cards.filter((card) =>
      [...card.querySelectorAll(".job-card-container__footer-job-state")]
        .some((el) => el.textContent.trim() === "Viewed"));
    assert.ok(viewed.length > 0, "Snapshot must contain viewed jobs");
    w.eval(source);
    await pause();
    const stats = send({ type: "GET_STATE" }).stats;
    assert.equal(stats.cards, cards.length);
    assert.equal(stats.viewed, viewed.length);
    assert.equal(stats.hidden, viewed.length);
    assert.ok(viewed.every(hidden), "Hide complete outer list items");
    assert.ok(cards.filter((c) => !viewed.includes(c)).every((c) => !hidden(c)));
    assert.ok(!hidden(w.document.body));
    console.log("Snapshot:", JSON.stringify(stats));

    send({ type: "SET_TEMPORARY_SHOWING", value: true });
    assert.ok(cards.every((c) => !hidden(c)));
    send({ type: "SET_TEMPORARY_SHOWING", value: false });
    assert.ok(viewed.every(hidden));
    storageChange({ hideViewedJobs: { newValue: false } }, "local");
    assert.ok(cards.every((c) => !hidden(c)));
    storageChange({ hideViewedJobs: { newValue: true } }, "local");
    assert.ok(viewed.every(hidden));

    let protectedHtml = "";
    for (const modern of [false, true]) {
      const card = w.document.createElement(modern ? "div" : "li");
      const id = modern ? "900002" : "900001";
      if (modern) {
        card.setAttribute("role", "button");
        card.setAttribute("componentkey", "job-card-component-ref-" + id);
      } else {
        card.setAttribute("data-occludable-job-id", id);
      }
      const status = w.document.createElement(modern ? "p" : "li");
      status.className = "job-card-container__footer-job-state";
      status.textContent = "Posted today";
      const footer = w.document.createElement("ul");
      footer.append(status);
      card.append(footer);
      w.document.body.append(card);
      await pause();
      card.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      status.textContent = "Viewed";
      await pause();
      assert.ok(!hidden(card), "Newly viewed job stays visible");
      const replacement = card.cloneNode(true);
      card.replaceWith(replacement);
      await pause();
      assert.ok(!hidden(replacement), "Protection survives DOM replacement");
      protectedHtml += replacement.outerHTML;
      replacement.setAttribute(modern ? "componentkey" : "data-occludable-job-id",
        modern ? "job-card-component-ref-900004" : "900003");
      await pause();
      assert.ok(hidden(replacement), "Recycled element with a different ID is filtered");
    }
    const refreshed = new JSDOM(protectedHtml, { runScripts: "outside-only" });
    try {
      refreshed.window.chrome = w.chrome;
      refreshed.window.eval(source);
      await pause();
      assert.equal(refreshed.window.document.querySelectorAll(".hlv-hidden-job").length, 2,
        "A fresh page hides previously protected jobs");
    } finally {
      refreshed.window.close();
    }
    console.log("PASS: whole cards, toggles, dynamic labels, click protection, recycled IDs, refresh");
  } finally {
    w.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
