// Trade Block: players teams are shopping. Entries live in officeData.tradeBlock (league-core.js).
const tbGrid = document.querySelector("#tb-grid");
const tbStatus = document.querySelector("#tb-status");
const tbNotice = document.querySelector("#tb-storage-notice");
const tbEmpty = document.querySelector("#tb-empty");
const tbForm = document.querySelector("#tb-form");
const tbSearch = document.querySelector("#tb-search");
const tbFilterPos = document.querySelector("#tb-filter-pos");
const tbFilterTeam = document.querySelector("#tb-filter-team");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  tbNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.tradeBlock)) officeData.tradeBlock = [];
const leagueYear = currentLeagueYear();

function save(message) {
  try {
    writeStoredOffice(officeData);
    tbStatus.textContent = message;
  } catch (error) {
    tbStatus.textContent = `Could not save: ${error.message}.`;
  }
}

// Current details for a listed player from his salary sheet (he may have moved or been released).
function sheetPlayer(entry) {
  const found = entry.playerId ? findPlayerById(officeData, entry.playerId) : null;
  return found && found.source === "sheet" ? found : null;
}

function fillTeamSelects() {
  const keep = tbFilterTeam.value;
  tbForm.elements.team.replaceChildren(new Option("Choose a team", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  tbFilterTeam.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  tbFilterTeam.value = keep;
}

function fillPlayers() {
  const teamId = tbForm.elements.team.value;
  const select = tbForm.elements.player;
  if (!teamId) { select.replaceChildren(new Option("Choose a team first", "")); return; }
  const listed = new Set(officeData.tradeBlock.map((e) => e.playerId));
  const roster = officeData.teams[teamId].roster
    .filter((p) => !p.activeSeasons.length || p.activeSeasons.some((s) => s >= leagueYear))
    .sort((a, b) => a.name.localeCompare(b.name));
  select.replaceChildren(new Option(roster.length ? "Choose a player" : "No players on this salary sheet", ""),
    ...roster.map((p) => {
      const pos = playerDisplayPosition(p, leagueYear);
      const option = new Option(`${p.name}${pos ? ` (${pos})` : ""}${listed.has(p.id) ? " — already listed" : ""}`, p.id);
      option.disabled = listed.has(p.id);
      return option;
    }));
}

function renderBlock() {
  const query = tbSearch.value.trim().toLowerCase();
  const keepPos = tbFilterPos.value;
  const groups = [...new Set(officeData.tradeBlock.map((e) => positionGroupFor(e.position)))];
  tbFilterPos.replaceChildren(new Option("All positions", ""), ...rosterPositionGroups.filter(([key]) => groups.includes(key)).map(([key, label]) => new Option(label, key)));
  tbFilterPos.value = groups.includes(keepPos) ? keepPos : "";
  const entries = officeData.tradeBlock
    .filter((e) => (!tbFilterTeam.value || e.teamId === tbFilterTeam.value) && (!tbFilterPos.value || positionGroupFor(e.position) === tbFilterPos.value) &&
      (!query || `${e.player} ${e.asking || ""} ${e.notes || ""}`.toLowerCase().includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.player.localeCompare(b.player));
  tbGrid.replaceChildren(...entries.map((entry) => {
    const found = sheetPlayer(entry);
    const card = document.createElement("article");
    card.className = `tb-card${found && found.teamId !== entry.teamId ? " is-moved" : ""}`;
    card.dataset.entryId = entry.id;
    const top = document.createElement("div");
    top.className = "tb-card-top";
    const team = document.createElement("a");
    team.className = "txn-team";
    team.href = `team.html?team=${encodeURIComponent(entry.teamId)}`;
    team.textContent = entry.teamId;
    team.title = teamName(entry.teamId);
    const pos = document.createElement("span");
    pos.className = "tb-pos";
    pos.textContent = entry.position || "—";
    const [y, m, d] = entry.date.split("-").map(Number);
    const date = document.createElement("span");
    date.className = "tb-date";
    date.textContent = `Listed ${new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    top.append(team, pos, date);
    const name = document.createElement("h3");
    if (entry.playerId) {
      const link = document.createElement("a");
      link.href = profileUrl(entry.playerId);
      link.textContent = entry.player;
      name.append(link);
    } else name.textContent = entry.player;
    card.append(top, name);
    // Contract facts from the sheet, for this league year.
    if (found) {
      const season = found.player.seasons[leagueYear];
      const facts = document.createElement("dl");
      facts.className = "tb-facts";
      const add = (label, value) => { const dt = document.createElement("dt"); dt.textContent = label; const dd = document.createElement("dd"); dd.textContent = value; facts.append(dt, dd); };
      if (season && isPlayerOnSeason(found.player, leagueYear)) {
        add(`${leagueYear} cap hit`, formatCurrency(capHitFor(season)));
        add("Years left", String(yearsRemainingFor(found.player, leagueYear)));
        if (calculatedPenaltiesFor(found.player, leagueYear)) add("Dead cap if traded", formatCurrency(calculatedPenaltiesFor(found.player, leagueYear).tradePenalty));
      }
      const age = playerAge(found.player);
      if (age !== null) add("Age", String(age));
      if (facts.children.length) card.append(facts);
    }
    if (entry.asking) {
      const ask = document.createElement("p");
      ask.className = "tb-asking";
      const label = document.createElement("strong");
      label.textContent = "Asking: ";
      ask.append(label, entry.asking);
      card.append(ask);
    }
    if (entry.notes) {
      const notes = document.createElement("p");
      notes.className = "tb-notes";
      notes.textContent = entry.notes;
      card.append(notes);
    }
    if (found && found.teamId !== entry.teamId) {
      const moved = document.createElement("p");
      moved.className = "tb-moved";
      moved.textContent = `Now on the ${teamName(found.teamId)}.`;
      card.append(moved);
    }
    const actions = document.createElement("div");
    actions.className = "tb-actions";
    const offer = document.createElement("a");
    offer.className = "workspace-button";
    offer.href = `team.html?team=${encodeURIComponent(entry.teamId)}`;
    offer.textContent = "Make an offer ↗";
    offer.title = `Open the ${teamName(entry.teamId)} sheet and use its Trade tab`;
    actions.append(offer);
    if (canSave) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "workspace-button";
      remove.dataset.action = "remove";
      remove.textContent = "Take off the block";
      actions.append(remove);
    }
    card.append(actions);
    return card;
  }));
  document.querySelector("#tb-count").textContent = String(entries.length);
  tbEmpty.hidden = entries.length > 0;
  tbEmpty.textContent = officeData.tradeBlock.length ? "No players match these filters." : "Nobody is on the trade block yet. Add a player above.";
}

tbForm.elements.team.addEventListener("change", fillPlayers);
tbSearch.addEventListener("input", renderBlock);
tbFilterPos.addEventListener("change", renderBlock);
tbFilterTeam.addEventListener("change", renderBlock);

tbForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !tbForm.reportValidity()) return;
  const teamId = tbForm.elements.team.value;
  const player = officeData.teams[teamId].roster.find((p) => p.id === tbForm.elements.player.value);
  if (!player) return;
  if (officeData.tradeBlock.length >= 2000) { tbStatus.textContent = "The trade block is full."; return; }
  const entry = { id: newRecordId("block"), player: player.name.slice(0, tradeBlockLimits.player), playerId: player.id, teamId, date: localDateString() };
  const pos = playerDisplayPosition(player, leagueYear);
  if (pos) entry.position = pos.slice(0, tradeBlockLimits.position);
  for (const field of ["asking", "notes"]) { const v = tbForm.elements[field].value.trim(); if (v) entry[field] = v.slice(0, tradeBlockLimits[field]); }
  officeData.tradeBlock.push(entry);
  save(`${player.name} is on the trade block.`);
  tbForm.elements.asking.value = "";
  tbForm.elements.notes.value = "";
  fillPlayers();
  renderBlock();
});

tbGrid.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="remove"]');
  const card = button?.closest("[data-entry-id]");
  const entry = card && officeData.tradeBlock.find(({ id }) => id === card.dataset.entryId);
  if (!entry || !canSave) return;
  const ok = await confirmAction(`Take ${entry.player} off the trade block?`, { confirmLabel: "Take off the block" });
  if (!ok) return;
  officeData.tradeBlock = officeData.tradeBlock.filter(({ id }) => id !== entry.id);
  save(`${entry.player} is off the trade block.`);
  fillPlayers();
  renderBlock();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.tradeBlock)) officeData.tradeBlock = [];
    fillPlayers();
    renderBlock();
  } catch {
    tbStatus.textContent = "An update from another tab could not be read.";
  }
});

if (!canSave) for (const element of tbForm.elements) element.disabled = true;
fillTeamSelects();
fillPlayers();
renderBlock();
