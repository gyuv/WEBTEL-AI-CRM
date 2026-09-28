// Runs ONLY when the user clicks the extension. Extracts visible text from the active tab once.
let captured = [];

function extractVisible() {
  const txt = (el) => (el ? el.innerText.trim().replace(/\s+/g, " ") : null);
  const q = (sel) => document.querySelector(sel);
  const url = location.href.split("?")[0];
  const people = [];
  if (/linkedin\.com\/in\//.test(url)) {
    const name = txt(q("h1"));
    const headline = txt(q(".text-body-medium.break-words")) || txt(q("[data-generated-suggestion-target]"));
    const location = txt(q(".text-body-small.inline.t-black--light.break-words"));
    const aboutSection = [...document.querySelectorAll("section")].find((s) => /^About/.test(txt(s.querySelector("h2")) || ""));
    const about = aboutSection ? txt(aboutSection.querySelector(".inline-show-more-text, .display-flex.ph5.pv3")) : null;
    const expSection = [...document.querySelectorAll("section")].find((s) => /^Experience/.test(txt(s.querySelector("h2")) || ""));
    const firstExp = expSection ? expSection.querySelector("li") : null;
    const company = firstExp ? (txt(firstExp.querySelector(".t-14.t-normal span[aria-hidden]")) || "").split("·")[0].trim() : (headline || "").split(/ at | @ /i)[1] || null;
    const title = firstExp ? txt(firstExp.querySelector(".t-bold span[aria-hidden]")) : null;
    const actSection = [...document.querySelectorAll("section")].find((s) => /^Activity/.test(txt(s.querySelector("h2")) || ""));
    const activity = actSection ? (txt(actSection.querySelector(".update-components-text, .feed-shared-inline-show-more-text")) || "").slice(0, 400) : null;
    if (name) people.push({ name, headline, title, company, location, about: about && about.slice(0, 2000), activity, profileUrl: url });
  } else {
    // Company "People" tab or search results: read the cards currently rendered on screen.
    const company = txt(q("h1"));
    document.querySelectorAll("li.org-people-profile-card__profile-card-spacing, li.reusable-search__result-container, .org-people-profile-card").forEach((card) => {
      const r = card.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight * 3) return; // only what's on/near screen
      const a = card.querySelector("a[href*='/in/']");
      const name = txt(card.querySelector(".artdeco-entity-lockup__title, .entity-result__title-text a span[aria-hidden]")) || (a ? txt(a) : null);
      const headline = txt(card.querySelector(".artdeco-entity-lockup__subtitle, .entity-result__primary-subtitle"));
      const loc = txt(card.querySelector(".entity-result__secondary-subtitle"));
      if (name && !/LinkedIn Member/i.test(name)) people.push({ name: name.split("\n")[0], headline, company: /\/company\//.test(location.href) ? company : null, location: loc, profileUrl: a ? a.href.split("?")[0] : null });
    });
    // Generic fallback for any other site: schema.org Person JSON-LD.
    if (!people.length) document.querySelectorAll("script[type='application/ld+json']").forEach((s) => {
      try { const j = JSON.parse(s.textContent); [].concat(j).forEach((n) => n["@type"] === "Person" && n.name && people.push({ name: n.name, title: n.jobTitle || null, company: (n.worksFor && n.worksFor.name) || null, profileUrl: n.url || null })); } catch (e) {}
    });
  }
  return { people: people.slice(0, 50), pageUrl: url };
}

document.getElementById("read").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractVisible });
  captured = res.result.people;
  const box = document.getElementById("preview");
  box.innerHTML = captured.length ? captured.map((p) => `<div class="p"><b>${esc(p.name)}</b><br><span class="muted">${esc(p.headline || p.title || "")}${p.company ? " · " + esc(p.company) : ""}</span></div>`).join("") : "Nothing recognisable on this page.";
  document.getElementById("send").disabled = !captured.length;
};

document.getElementById("send").onclick = async () => {
  const { baseUrl, token } = await chrome.storage.sync.get(["baseUrl", "token"]);
  const st = document.getElementById("status");
  if (!baseUrl || !token) { st.innerHTML = '<span class="err">Set your LeadForge URL and token in Settings first.</span>'; return; }
  const origin = new URL(baseUrl).origin + "/*";
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) { st.textContent = "Permission needed to contact your LeadForge."; return; }
  st.textContent = "Sending…";
  try {
    const r = await fetch(new URL("/api/extension/capture", baseUrl), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ people: captured }) });
    const j = await r.json();
    st.innerHTML = r.ok ? `<span class="ok">Saved ${j.saved} of ${captured.length} ✓</span>` : `<span class="err">${esc(j.error || r.status)}</span>`;
  } catch (e) { st.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
};

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
