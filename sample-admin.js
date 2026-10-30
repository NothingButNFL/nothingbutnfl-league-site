// Admin: load or remove the made-up sample league (sample-league.js): a full 17-game season with 53-man rosters.
// Before loading, the current saved data is copied to IndexedDB (see league-core.js); removing puts that copy back exactly.
const sampleLoadButton = document.querySelector("#sample-load");
const sampleRemoveButton = document.querySelector("#sample-remove");
const sampleStatus = document.querySelector("#sample-status");

function sampleIsLoaded() {
  try {
    return isSampleLeagueActive();
  } catch {
    return false;
  }
}

function renderSamplePanel() {
  const loaded = sampleIsLoaded();
  sampleLoadButton.hidden = loaded;
  sampleRemoveButton.hidden = !loaded;
}

sampleLoadButton.addEventListener("click", async () => {
  if (typeof sampleLeague === "undefined") {
    sampleStatus.textContent = "The sample file (sample-league.js) is missing from this folder.";
    return;
  }
  const ok = await confirmAction("Load the sample league? It's a full 17-game season with 53-man salary sheets for all 32 teams. Salary sheets, Player Contracts, caps, games, stats, standings, schedule, awards, transactions, injuries and key dates are replaced with made-up ones until you remove it. Your current data is saved and comes back exactly when you remove the sample.", { confirmLabel: "Load sample league" });
  if (!ok) return;
  sampleStatus.textContent = "Loading the sample league…";
  let raw;
  let data;
  try {
    raw = localStorage.getItem(officeStorageKey);
    data = raw ? loadStoredOfficeData(JSON.parse(raw)) : emptyOfficeData();
  } catch (error) {
    sampleStatus.textContent = error instanceof SyntaxError ? "Your saved data couldn't be read, so the sample wasn't loaded. Nothing was changed." : `Could not load the sample: ${error.message}. Nothing was changed.`;
    return;
  }
  try {
    await saveSampleBackup(raw);
  } catch (error) {
    sampleStatus.textContent = `Your data couldn't be backed up (${error.message}), so the sample wasn't loaded. Nothing was changed.`;
    return;
  }
  try {
    const copy = JSON.parse(JSON.stringify(sampleLeague));
    for (const { id } of nflTeams) data.teams[id] = copy.teams[id];
    data.leagueCaps = copy.leagueCaps;
    data.contractPlayers = copy.contractPlayers;
    data.games = copy.games;
    data.standings = copy.standings;
    data.stats = { season: copy.season, tables: {} };
    data.schedule = copy.schedule || [];
    data.awards = copy.awards || [];
    data.transactions = copy.transactions;
    data.tradeNumberNext = copy.tradeNumberNext;
    data.injuries = copy.injuries;
    data.keyDates = copy.keyDates;
    // These point at players on the old salary sheets, so they start empty with the sample (depth charts come with it).
    data.pendingTrades = [];
    data.tradeBlock = [];
    data.depthCharts = copy.depthCharts || {};
    data.streamUpdates = [];
    data.sampleLeague = true;
    localStorage.removeItem(officeStorageKey); // make room: the copy is safe in the backup store
    writeStoredOffice(data);
    const players = nflTeams.reduce((sum, { id }) => sum + data.teams[id].roster.length, 0);
    sampleStatus.textContent = `Sample league loaded: all ${copy.games.length} games of a 17-game season and ${players.toLocaleString("en-US")} players on 32 salary sheets. Open the Overview, a team sheet, or anything under Front Office and Season Information to look around.`;
  } catch (error) {
    // Put the user's data back if the sample didn't fit.
    try { if (raw !== null) localStorage.setItem(officeStorageKey, raw); localStorage.removeItem(sampleBackupKey); } catch { /* the backup store still has it */ }
    sampleStatus.textContent = /quota/i.test(`${error.name} ${error.message}`)
      ? "There isn't enough room in this browser's storage for the sample league. Nothing was changed."
      : `Could not load the sample: ${error.message}. Nothing was changed.`;
  }
  renderSamplePanel();
  showSampleBanner();
});

sampleRemoveButton.addEventListener("click", async () => {
  const ok = await confirmAction("Remove the sample league and put back the data you had before loading it? Anything changed while the sample was loaded is discarded.", { confirmLabel: "Remove sample league", danger: true });
  if (!ok) return;
  try {
    await restoreFromSampleBackup();
    sampleStatus.textContent = "Sample league removed. Your data is back the way it was.";
  } catch (error) {
    sampleStatus.textContent = `Could not restore: ${error.message}.`;
  }
  renderSamplePanel();
  showSampleBanner();
});

window.addEventListener("storage", (event) => {
  if (event.key === officeStorageKey) renderSamplePanel();
});
renderSamplePanel();
