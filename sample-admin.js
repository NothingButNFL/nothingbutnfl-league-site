// Overview: load or remove the made-up sample league (sample-league.js, cut to 8 weeks and filled out by sample-midseason.js).
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
  const ok = await confirmAction("Load the sample league? It's a season 8 weeks in, with 53-man salary sheets and practice squads for all 32 teams. Salary sheets, Player Contracts, caps, draft picks, the trade block, pending trades, waivers, games, stats, standings, schedule, awards, transactions, injuries, key dates, members, news and admin queues are replaced with made-up ones until you remove it. Your current data is saved and comes back exactly when you remove the sample.", { confirmLabel: "Load sample league" });
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
    const built = buildMidseasonSample(copy, data); // sample-midseason.js: 8 weeks played, every feature filled in
    data.sampleLeague = true;
    localStorage.removeItem(officeStorageKey); // make room: the copy is safe in the backup store
    writeStoredOffice(data);
    const players = nflTeams.reduce((sum, { id }) => sum + data.teams[id].roster.length, 0);
    sampleStatus.textContent = `Sample league loaded: ${built.games} games through Week ${sampleWeeksPlayed} and ${players.toLocaleString("en-US")} players on 32 salary sheets (practice squads included). Week ${sampleWeeksPlayed + 1} is up next. Open the Overview, a team sheet, or anything under Front Office, Season Information and News to look around.`;
  } catch (error) {
    // Put the user's data back if the sample didn't fit.
    try { if (raw !== null) localStorage.setItem(officeStorageKey, raw); localStorage.removeItem(sampleBackupKey); } catch { /* the backup store still has it */ }
    sampleStatus.textContent = /quota/i.test(`${error.name} ${error.message}`)
      ? "There isn't enough room in this browser's storage for the sample league. Nothing was changed."
      : `Could not load the sample: ${error.message}. Nothing was changed.`;
  }
  renderSamplePanel();
  showSampleBanner();
  refreshOverviewAfterSample();
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
  refreshOverviewAfterSample();
});

// The Overview's key dates, leaders and standings were drawn from the old data, so redraw the page (keeping the
// status message) after the sample is loaded or removed.
function refreshOverviewAfterSample() {
  try { sessionStorage.setItem("nbf-sample-status", sampleStatus.textContent); } catch { /* fine without it */ }
  location.hash = "sample-league";
  location.reload();
}
try {
  const note = sessionStorage.getItem("nbf-sample-status");
  if (note) { sampleStatus.textContent = note; sessionStorage.removeItem("nbf-sample-status"); }
} catch { /* storage unavailable */ }
// The reload above lands on the Sample league card once; drop the #sample-league from the address afterwards so the
// Overview doesn't keep jumping there every time it's opened or refreshed.
if (location.hash === "#sample-league") history.replaceState(null, "", location.pathname + location.search);

window.addEventListener("storage", (event) => {
  if (event.key === officeStorageKey) renderSamplePanel();
});
renderSamplePanel();
