// Admin › Player Details › Injury Reviews: the injury clock (league-core.js injuryWeeksLeft), returns waiting for
// approval, and the injury log (officeData.injuryLog).
const irStatus = document.querySelector("#ir-status");
const irNotice = document.querySelector("#ir-storage-notice");
const irReady = document.querySelector("#ir-ready");
const irLogTeam = document.querySelector("#ir-log-team");
const irLogType = document.querySelector("#ir-log-type");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  irNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.injuries)) officeData.injuries = [];
if (!Array.isArray(officeData.injuryLog)) officeData.injuryLog = [];

function save(message) {
  try {
    writeStoredOffice(officeData);
    irStatus.textContent = message;
    if (typeof refreshNavNotifications === "function") refreshNavNotifications();
  } catch (error) {
    irStatus.textContent = `Could not save: ${error.message}.`;
  }
}

const weekLabel = (week) => (week > regularSeasonWeeks ? "After the regular season" : `Week ${week}`);
const weeksText = (n) => `${n} ${n === 1 ? "week" : "weeks"}`;

function playerLink(entry) {
  const found = entry.playerId ? findPlayerById(officeData, entry.playerId) : findPlayerByName(officeData, entry.player, entry.teamId);
  if (!found) return document.createTextNode(entry.player);
  const link = document.createElement("a");
  link.className = "player-name-link";
  link.href = profileUrl(found.player.id);
  link.textContent = entry.player;
  return link;
}

function teamLink(teamId) {
  const link = document.createElement("a");
  link.className = "txn-team";
  link.href = `team.html?team=${encodeURIComponent(teamId)}`;
  link.title = teamName(teamId);
  link.textContent = teamId;
  return link;
}

function button(text, action, className = "workspace-button") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.dataset.action = action;
  b.textContent = text;
  b.disabled = !canSave;
  return b;
}

function renderReady() {
  const ready = injuriesReadyToReturn(officeData).sort((a, b) => teamName(a.teamId).localeCompare(teamName(b.teamId)) || a.player.localeCompare(b.player));
  irReady.replaceChildren(...ready.map((entry) => {
    const card = document.createElement("article");
    card.className = "ir-card";
    card.dataset.injId = entry.id;
    const head = document.createElement("header");
    const who = document.createElement("div");
    who.className = "ir-who";
    const pos = document.createElement("span");
    pos.className = "ir-pos";
    pos.textContent = entry.position || "—";
    who.append(teamLink(entry.teamId), pos, playerLink(entry));
    const flag = document.createElement("span");
    flag.className = "ir-flag";
    flag.textContent = "0 weeks left";
    head.append(who, flag);
    const meta = document.createElement("p");
    meta.className = "ir-meta";
    meta.textContent = [entry.injury || "Injury", entry.ir ? "On Injured Reserve" : "", `out ${weeksText(entry.weeks)} from ${weekLabel(entry.clockWeek)}`,
      entry.notes || ""].filter(Boolean).join(" · ");
    const actions = document.createElement("div");
    actions.className = "ir-actions";
    actions.append(button("Approve return ✓", "approve", "button button-lime"), button("Keep out 1 more week", "extend"));
    card.append(head, meta, actions);
    return card;
  }));
  document.querySelector("#ir-ready-empty").hidden = ready.length > 0;
}

function renderClock() {
  const now = leagueCurrentWeek(officeData).week;
  const rows = officeData.injuries.map((entry) => ({ entry, left: injuryWeeksLeft(officeData, entry) }))
    .filter(({ left }) => left !== 0)
    .sort((a, b) => (a.left ?? 999) - (b.left ?? 999) || a.entry.player.localeCompare(b.entry.player));
  document.querySelector("#ir-clock").replaceChildren(...rows.map(({ entry, left }) => {
    const tr = document.createElement("tr");
    tr.insertCell().append(teamLink(entry.teamId));
    tr.insertCell().append(playerLink(entry));
    tr.insertCell().textContent = entry.position || "—";
    tr.insertCell().textContent = entry.injury || "—";
    tr.insertCell().textContent = entry.ir ? "IR" : "";
    const cell = tr.insertCell();
    cell.className = "ir-left";
    cell.textContent = left === null ? (entry.duration ? `${entry.duration} (no clock)` : "TBD") : String(left);
    tr.insertCell().textContent = left === null ? "—" : weekLabel(now + left);
    return tr;
  }));
  document.querySelector("#ir-clock-empty").hidden = rows.length > 0;
}

const logLabels = { injured: "Injured", healthy: "Healthy", extended: "Kept out longer", updated: "Changed" };
function renderLog() {
  const keep = irLogTeam.value;
  irLogTeam.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  irLogTeam.value = keep;
  const rows = officeData.injuryLog
    .filter((e) => (!irLogTeam.value || e.teamId === irLogTeam.value) && (!irLogType.value || e.type === irLogType.value))
    .sort((a, b) => b.at.localeCompare(a.at));
  document.querySelector("#ir-log").replaceChildren(...rows.slice(0, 500).map((e) => {
    const tr = document.createElement("tr");
    tr.className = `ir-log-${e.type}`;
    tr.insertCell().textContent = new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    tr.insertCell().textContent = `${e.season} ${e.week > regularSeasonWeeks ? "Post" : `W${e.week}`}`;
    const type = tr.insertCell();
    const chip = document.createElement("span");
    chip.className = `ir-type ir-type-${e.type}`;
    chip.textContent = logLabels[e.type];
    type.append(chip);
    tr.insertCell().append(teamLink(e.teamId));
    tr.insertCell().append(playerLink(e));
    tr.insertCell().textContent = e.position || "—";
    tr.insertCell().textContent = e.injury || "—";
    tr.insertCell().textContent = [e.type !== "healthy" && Number.isInteger(e.weeks) ? `${weeksText(e.weeks)} left` : "", e.ir && e.type !== "healthy" ? "IR" : "", e.note || ""].filter(Boolean).join(" · ");
    return tr;
  }));
  document.querySelector("#ir-log-count").textContent = String(rows.length);
  document.querySelector("#ir-log-empty").hidden = rows.length > 0;
}

function render() {
  const { week } = leagueCurrentWeek(officeData);
  document.querySelector("#ir-week").textContent = `League week: ${weekLabel(week)} (${currentLeagueYear()}). The clock moves when the week does: on box scores for the next week, or the week set in Admin.`;
  renderReady();
  renderClock();
  renderLog();
}

irReady.addEventListener("click", async (event) => {
  const b = event.target.closest("[data-action]");
  const id = b?.closest("[data-inj-id]")?.dataset.injId;
  const entry = id && officeData.injuries.find((e) => e.id === id);
  if (!entry || !canSave) return;
  try { officeData = readStoredOffice() || officeData; } catch { /* keep what we have */ }
  const live = officeData.injuries.find((e) => e.id === id);
  if (!live) { render(); return; }
  if (b.dataset.action === "approve") {
    if (!await confirmAction(`Approve ${live.player}'s return? He comes off the injury report and is healthy again.`, { confirmLabel: "Approve return" })) return;
    officeData.injuries = officeData.injuries.filter((e) => e.id !== id);
    logInjury(officeData, "healthy", live, "Return approved by the commissioner");
    save(`${live.player} is healthy and back. He's off the injury report.`);
  } else {
    setInjuryClock(officeData, live, 1);
    live.updatedAt = new Date().toISOString();
    logInjury(officeData, "extended", live, "Kept out 1 more week by the commissioner");
    save(`${live.player} stays out 1 more week.`);
  }
  render();
});
irLogTeam.addEventListener("change", renderLog);
irLogType.addEventListener("change", renderLog);

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.injuries)) officeData.injuries = [];
    if (!Array.isArray(officeData.injuryLog)) officeData.injuryLog = [];
    render();
  } catch {
    irStatus.textContent = "An update from another tab could not be read.";
  }
});

if (canSave && startLegacyInjuryClocks(officeData)) save("Injury clocks started for injuries with a number of weeks.");
render();
