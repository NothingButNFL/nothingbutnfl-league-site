// Sidebar › Sample league: a button at the bottom of the main menu on every page that loads or removes the made-up
// sample league (sample-league.js, cut to 8 weeks and filled out by sample-midseason.js). The two data files (~4 MB)
// are only downloaded when the button is used. Before loading, the current saved data is copied to IndexedDB (see
// league-core.js); removing puts that copy back exactly. Messages show as a toast, also after the page reloads.
const sampleToastKey = "nbf-sample-status";
const sampleFlask = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M9 3h6M10 3v6.2L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3"/><path d="M7.4 14.5h9.2"/></svg>';

function sampleIsLoaded() {
  try { return isSampleLeagueActive(); } catch { return false; }
}

function sampleToast(message) {
  if (!message) return;
  let toast = document.querySelector(".sample-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "sample-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    const text = document.createElement("span");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sample-toast-close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", () => toast.remove());
    toast.append(text, close);
    document.body.append(toast);
  }
  toast.querySelector("span").textContent = message;
  clearTimeout(sampleToast.timer);
  sampleToast.timer = setTimeout(() => toast.remove(), 12000);
}

// Loads sample-league.js and sample-midseason.js on first use.
function sampleLoadFiles() {
  const load = (src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`${src} couldn't be loaded`));
    document.head.append(script);
  });
  return (typeof sampleLeague !== "undefined" ? Promise.resolve() : load("sample-league.js"))
    .then(() => (typeof buildMidseasonSample === "function" ? undefined : load("sample-midseason.js")));
}

// The page was drawn from the old data, so reload it (keeping the message for the toast).
function sampleReload(message) {
  try { sessionStorage.setItem(sampleToastKey, message); } catch { /* fine without it */ }
  location.reload();
}

async function loadSampleLeague() {
  const ok = await confirmAction("Load the sample league? It's a season 8 weeks in, with 53-man salary sheets and practice squads for all 32 teams. Salary sheets, Player Contracts, caps, draft picks, the trade block, pending trades, waivers, games, stats, standings, schedule, awards, transactions, injuries, key dates, members, news and admin queues are replaced with made-up ones until you remove it. Your current data is saved and comes back exactly when you remove the sample.", { confirmLabel: "Load sample league" });
  if (!ok) return;
  sampleToast("Loading the sample league…");
  try { await sampleLoadFiles(); } catch (error) { sampleToast(`Could not load the sample: ${error.message}. Nothing was changed.`); return; }
  let raw;
  let data;
  try {
    raw = localStorage.getItem(officeStorageKey);
    data = raw ? loadStoredOfficeData(JSON.parse(raw)) : emptyOfficeData();
  } catch (error) {
    sampleToast(error instanceof SyntaxError ? "Your saved data couldn't be read, so the sample wasn't loaded. Nothing was changed." : `Could not load the sample: ${error.message}. Nothing was changed.`);
    return;
  }
  try {
    await saveSampleBackup(raw);
  } catch (error) {
    sampleToast(`Your data couldn't be backed up (${error.message}), so the sample wasn't loaded. Nothing was changed.`);
    return;
  }
  try {
    const copy = JSON.parse(JSON.stringify(sampleLeague));
    const built = buildMidseasonSample(copy, data); // sample-midseason.js: 8 weeks played, every feature filled in
    data.sampleVersion = sampleVersion;
    data.sampleLeague = true;
    localStorage.removeItem(officeStorageKey); // make room: the copy is safe in the backup store
    writeStoredOffice(data);
    const players = nflTeams.reduce((sum, { id }) => sum + data.teams[id].roster.length, 0);
    sampleReload(`Sample league loaded: ${built.games} games through Week ${sampleWeeksPlayed} and ${players.toLocaleString("en-US")} players on 32 salary sheets (practice squads included). Week ${sampleWeeksPlayed + 1} is up next.`);
  } catch (error) {
    // Put the user's data back if the sample didn't fit.
    try { if (raw !== null) localStorage.setItem(officeStorageKey, raw); localStorage.removeItem(sampleBackupKey); } catch { /* the backup store still has it */ }
    sampleToast(/quota/i.test(`${error.name} ${error.message}`)
      ? "There isn't enough room in this browser's storage for the sample league. Nothing was changed."
      : `Could not load the sample: ${error.message}. Nothing was changed.`);
  }
}

async function removeSampleLeague() {
  const ok = await confirmAction("Remove the sample league and put back the data you had before loading it? Anything changed while the sample was loaded is discarded.", { confirmLabel: "Remove sample league", danger: true });
  if (!ok) return;
  try {
    await restoreFromSampleBackup();
    sampleReload("Sample league removed. Your data is back the way it was.");
  } catch (error) {
    sampleToast(`Could not restore: ${error.message}.`);
  }
}

// The sidebar button: last item of the main menu, so it also shows in the collapsed sidebar and the phone menu.
function renderSampleNav() {
  const nav = document.querySelector("#primary-nav");
  if (!nav) return;
  let item = nav.querySelector(".sample-nav");
  if (!item) {
    item = document.createElement("a");
    item.href = "#";
    item.className = "sample-nav";
    item.setAttribute("role", "button");
    item.innerHTML = `<span class="nav-icon" aria-hidden="true">${sampleFlask}</span><span class="nav-label"></span>`;
    item.addEventListener("click", (event) => {
      event.preventDefault();
      if (sampleIsLoaded()) removeSampleLeague(); else loadSampleLeague();
    });
    nav.append(item);
  }
  const loaded = sampleIsLoaded();
  item.classList.toggle("is-loaded", loaded);
  item.querySelector(".nav-label").textContent = loaded ? "Remove Sample League" : "Load Sample League";
  item.title = loaded ? "Remove the sample league and restore your data" : "Load a made-up league 8 weeks into its season";
}

renderSampleNav();
try {
  const note = sessionStorage.getItem(sampleToastKey);
  if (note) { sessionStorage.removeItem(sampleToastKey); sampleToast(note); }
} catch { /* storage unavailable */ }
// Old links to the Overview's Sample league card.
if (location.hash === "#sample-league") history.replaceState(null, "", location.pathname + location.search);
window.addEventListener("storage", (event) => {
  if (event.key === officeStorageKey || event.key === sampleBackupKey) renderSampleNav();
});

// A sample loaded before the 8-week version (the full 18-week season) is rebuilt in place. Your own data stays safe in
// the backup store, so Remove Sample League still puts it back exactly.
(function upgradeOldSample() {
  if (!sampleIsLoaded()) return;
  let data;
  try { data = readStoredOffice(); } catch { return; }
  if (!data?.sampleLeague || data.sampleVersion === 2) return;
  sampleLoadFiles().then(() => {
    buildMidseasonSample(JSON.parse(JSON.stringify(sampleLeague)), data);
    data.sampleVersion = sampleVersion;
    localStorage.removeItem(officeStorageKey);
    writeStoredOffice(data);
    sampleReload(`The sample league was updated to the 8-week version: games through Week ${sampleWeeksPlayed}, with Week ${sampleWeeksPlayed + 1} up next.`);
  }).catch((error) => sampleToast(`The sample league couldn't be updated to the 8-week version (${error.message}). Remove it and load it again.`));
})();
