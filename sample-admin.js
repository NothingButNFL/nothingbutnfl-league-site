// Admin: load or remove the made-up 5-week sample league (sample-league.js).
// Before loading, the current saved data is copied to sampleBackupKey; removing puts that copy back exactly.
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
  const ok = await confirmAction("Load the 5-week sample league? Games, stats, standings, transactions, injuries and key dates will be replaced with made-up ones until you remove it. Your current data is saved and comes back when you remove the sample.", { confirmLabel: "Load sample league" });
  if (!ok) return;
  try {
    const raw = localStorage.getItem(officeStorageKey);
    let data = emptyOfficeData();
    if (raw) data = loadStoredOfficeData(JSON.parse(raw));
    localStorage.setItem(sampleBackupKey, raw === null ? sampleNoDataMarker : raw);
    const copy = JSON.parse(JSON.stringify(sampleLeague));
    data.games = copy.games;
    data.standings = copy.standings;
    data.stats = { season: copy.season, tables: {} };
    data.transactions = copy.transactions;
    data.tradeNumberNext = copy.tradeNumberNext;
    data.injuries = copy.injuries;
    data.keyDates = copy.keyDates;
    data.sampleLeague = true;
    writeStoredOffice(data);
    sampleStatus.textContent = `Sample league loaded: ${copy.games.length} games through week ${copy.weeks}. Open the Overview, Stats, Standings, Transaction Log or Injury Report to look around.`;
  } catch (error) {
    sampleStatus.textContent = error instanceof SyntaxError
      ? "Your saved data couldn't be read, so the sample wasn't loaded. Nothing was changed."
      : `Could not load the sample: ${error.message}. Nothing was changed.`;
  }
  renderSamplePanel();
  showSampleBanner();
});

sampleRemoveButton.addEventListener("click", async () => {
  const ok = await confirmAction("Remove the sample league and put back the data you had before loading it? Anything changed while the sample was loaded is discarded.", { confirmLabel: "Remove sample league", danger: true });
  if (!ok) return;
  try {
    restoreFromSampleBackup();
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
