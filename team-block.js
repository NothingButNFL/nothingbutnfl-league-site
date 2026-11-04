// Team sheet Team Actions › Trade Block: list this team's players on the league Trade Block (officeData.tradeBlock,
// shown on trade-block.html) with a note. Injured players can't be listed. Uses front-office.js globals.
const tbkRows = document.querySelector("#tbk-rows");
const tbkYear = () => seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
let tbkEditing = null; // player id whose note row is open

const tbkEntries = () => (officeData.tradeBlock || []).filter((e) => e.teamId === activeTeamId);
const tbkEntryFor = (playerId) => (officeData.tradeBlock || []).find((e) => e.playerId === playerId && e.teamId === activeTeamId) || null;
const tbkRoster = () => officeData.teams[activeTeamId].roster
  .filter((p) => !p.activeSeasons.length || p.activeSeasons.some((s) => s >= tbkYear()))
  .sort((a, b) => capHitFor(seasonEntry(b, tbkYear())) - capHitFor(seasonEntry(a, tbkYear())) || a.name.localeCompare(b.name));
const tbkInjury = (player) => injuryForPlayer(officeData, player, activeTeamId);
const tbkInjuryText = (injury) => [injury.ir ? "Injured Reserve" : "Injured", injury.injury, injury.duration].filter(Boolean).join(" · ");
const tbkDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

function tbkListedCard(entry) {
  const player = officeData.teams[activeTeamId].roster.find((p) => p.id === entry.playerId);
  const card = document.createElement("article");
  card.className = "fa-offer is-pending tbk-card";
  card.dataset.playerId = entry.playerId || "";
  card.dataset.entryId = entry.id;
  const head = document.createElement("div");
  head.className = "fa-offer-head";
  const who = document.createElement("strong");
  if (entry.playerId) {
    const link = document.createElement("a");
    link.className = "player-name-link";
    link.href = profileUrl(entry.playerId);
    link.textContent = entry.player;
    who.append(link);
  } else who.textContent = entry.player;
  const status = document.createElement("span");
  status.className = "fa-offer-status";
  status.textContent = entry.position || "On the block";
  head.append(who, status);
  card.append(head);
  if (entry.asking) {
    const ask = document.createElement("p");
    ask.className = "fa-offer-terms";
    ask.textContent = `Asking: ${entry.asking}`;
    card.append(ask);
  }
  const note = document.createElement("p");
  note.className = entry.notes ? "fa-offer-notes-text" : "fa-offer-meta";
  note.textContent = entry.notes ? `“${entry.notes}”` : "No note.";
  card.append(note);
  const meta = document.createElement("p");
  meta.className = "fa-offer-meta";
  const injury = player && tbkInjury(player);
  meta.textContent = [`Listed ${tbkDate(entry.date)}`, injury ? `Now on the injury report (${tbkInjuryText(injury)})` : ""].filter(Boolean).join(" · ");
  card.append(meta);
  if (storageIsAvailable) {
    const actions = document.createElement("div");
    actions.className = "tbk-card-actions";
    if (player) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "workspace-button";
      edit.dataset.action = "tbk-edit";
      edit.textContent = "Edit note";
      actions.append(edit);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "workspace-button";
    remove.dataset.action = "tbk-remove";
    remove.textContent = "Take off the block";
    actions.append(remove);
    card.append(actions);
  }
  return card;
}

function tbkNoteRow(player, entry) {
  const tr = document.createElement("tr");
  tr.className = "tbk-note-row";
  tr.dataset.playerId = player.id;
  const cell = tr.insertCell();
  cell.colSpan = 7;
  const form = document.createElement("form");
  form.className = "tbk-note-form";
  const label = document.createElement("label");
  label.textContent = `Note on ${player.name}`;
  const input = document.createElement("input");
  input.name = "notes";
  input.maxLength = tradeBlockLimits.notes;
  input.placeholder = "Optional — e.g. looking for a 2027 2nd round pick, or a starting CB";
  input.value = entry?.notes || "";
  label.append(input);
  const save = document.createElement("button");
  save.className = "button button-lime";
  save.type = "submit";
  save.textContent = entry ? "Save note" : "Put on the block";
  const cancel = document.createElement("button");
  cancel.className = "workspace-button";
  cancel.type = "button";
  cancel.dataset.action = "tbk-cancel";
  cancel.textContent = "Cancel";
  form.append(label, save, cancel);
  cell.append(form);
  return tr;
}

function renderTeamBlock() {
  const year = tbkYear();
  document.querySelector("#tbk-cap-head").textContent = `${year} CAP HIT`;
  const listed = tbkEntries().sort((a, b) => b.date.localeCompare(a.date) || a.player.localeCompare(b.player));
  const box = document.querySelector("#tbk-listed");
  if (listed.length) box.replaceChildren(...listed.map(tbkListedCard));
  else {
    const note = document.createElement("p");
    note.className = "empty-state";
    note.textContent = "Nobody from this team is on the trade block. Pick a player below and click Add to block.";
    box.replaceChildren(note);
  }
  document.querySelector("#tbk-listed-count").textContent = String(listed.length);
  document.querySelector("#tbk-listed-box").classList.toggle("has-offers", listed.length > 0);

  const roster = tbkRoster();
  if (tbkEditing && !roster.some((p) => p.id === tbkEditing)) tbkEditing = null;
  const rows = [];
  for (const p of roster) {
    const entry = tbkEntryFor(p.id);
    const injury = tbkInjury(p);
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;
    if (entry) tr.className = "is-listed";
    const name = tr.insertCell();
    const link = document.createElement("a");
    link.className = "player-name-link";
    link.href = profileUrl(p.id);
    link.textContent = p.name;
    name.append(playerPortrait(p), link);
    tr.insertCell().textContent = playerDisplayPosition(p, year) || "—";
    const age = playerAge(p);
    tr.insertCell().textContent = age === null ? "—" : String(age);
    const onSheet = isPlayerOnSeason(p, year);
    tr.insertCell().textContent = onSheet ? formatCurrency(capHitFor(seasonEntry(p, year))) : "—";
    tr.insertCell().textContent = onSheet ? String(yearsRemainingFor(p, year)) : "—";
    const status = tr.insertCell();
    if (injury) {
      const badge = document.createElement("a");
      badge.className = "tbk-status is-injured";
      badge.href = "injuries.html";
      badge.textContent = injury.ir ? "IR" : "Injured";
      badge.title = `On the injury report: ${tbkInjuryText(injury)}`;
      status.append(badge);
    }
    if (entry) {
      const badge = document.createElement("span");
      badge.className = "tbk-status is-listed";
      badge.textContent = "On the block";
      status.append(badge);
    }
    if (!injury && !entry) status.textContent = "—";
    const action = tr.insertCell();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row-transaction";
    button.dataset.action = entry ? "tbk-edit" : "tbk-add";
    button.textContent = entry ? "Edit note" : "Add to block";
    button.disabled = !storageIsAvailable || (!entry && Boolean(injury));
    if (!entry && injury) button.title = `${p.name} is injured (${tbkInjuryText(injury)}) and can't be put on the trade block.`;
    action.append(button);
    rows.push(tr);
    if (tbkEditing === p.id && (entry || !injury)) rows.push(tbkNoteRow(p, entry));
  }
  tbkRows.replaceChildren(...rows);
  const empty = document.querySelector("#tbk-empty");
  empty.hidden = roster.length > 0;
  empty.textContent = "No players on this salary sheet.";
}

// Why a player can't go on the block right now ("" if he can).
function tbkProblem(player) {
  if (tbkEntryFor(player.id)) return `${player.name} is already on the trade block.`;
  const injury = tbkInjury(player);
  if (injury) return `${player.name} is injured (${tbkInjuryText(injury)}) and can't be put on the trade block.`;
  if ((officeData.tradeBlock || []).length >= 2000) return "The trade block is full.";
  return "";
}
// Adds this team's player to officeData.tradeBlock (same entry shape the Trade Block page uses). Doesn't save.
// Returns "" on success, else the reason it couldn't.
function tbkAdd(player, notes = "") {
  const problem = tbkProblem(player);
  if (problem) return problem;
  if (!Array.isArray(officeData.tradeBlock)) officeData.tradeBlock = [];
  const entry = { id: newRecordId("block"), player: player.name.slice(0, tradeBlockLimits.player), playerId: player.id, teamId: activeTeamId, date: localDateString() };
  const pos = playerDisplayPosition(player, tbkYear());
  if (pos) entry.position = pos.slice(0, tradeBlockLimits.position);
  if (notes) entry.notes = notes.slice(0, tradeBlockLimits.notes);
  officeData.tradeBlock.push(entry);
  return "";
}

function tbkOpen(playerId) {
  tbkEditing = playerId;
  renderTeamBlock();
  const input = tbkRows.querySelector(`.tbk-note-row[data-player-id="${CSS.escape(playerId)}"] input`);
  input?.closest("tr").scrollIntoView({ behavior: "smooth", block: "nearest" });
  input?.focus({ preventScroll: true });
}

async function tbkRemove(entry) {
  const ok = await confirmAction(`Take ${entry.player} off the trade block?`, { confirmLabel: "Take off the block" });
  if (!ok) return;
  const before = officeData.tradeBlock;
  officeData.tradeBlock = before.filter((e) => e.id !== entry.id);
  saveOfficeData(`${entry.player} is off the trade block.`);
  if (!storageIsAvailable) officeData.tradeBlock = before;
  if (tbkEditing === entry.playerId) tbkEditing = null;
  renderTeamBlock();
}

tbkRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  const playerId = button?.closest("tr")?.dataset.playerId;
  if (!button || !playerId) return;
  if (button.dataset.action === "tbk-cancel") { tbkEditing = null; renderTeamBlock(); return; }
  if (button.dataset.action === "tbk-add" || button.dataset.action === "tbk-edit") tbkOpen(tbkEditing === playerId ? null : playerId);
});

tbkRows.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!storageIsAvailable) return;
  const playerId = event.target.closest("tr")?.dataset.playerId;
  const player = officeData.teams[activeTeamId].roster.find((p) => p.id === playerId);
  if (!player) return;
  const notes = event.target.elements.notes.value.trim().slice(0, tradeBlockLimits.notes);
  if (!Array.isArray(officeData.tradeBlock)) officeData.tradeBlock = [];
  const existing = tbkEntryFor(player.id);
  const before = JSON.stringify(officeData.tradeBlock);
  if (existing) {
    if (notes) existing.notes = notes; else delete existing.notes;
    saveOfficeData(`Note on ${player.name} saved.`);
  } else {
    const problem = tbkAdd(player, notes);
    if (problem) { workspaceStatus.textContent = problem; return; }
    saveOfficeData(`${player.name} is on the trade block.`);
  }
  if (!storageIsAvailable) { officeData.tradeBlock = JSON.parse(before); return; }
  tbkEditing = null;
  renderTeamBlock();
  document.querySelector("#tbk-listed-box").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.querySelector("#tbk-listed").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  const card = button?.closest("[data-entry-id]");
  const entry = card && (officeData.tradeBlock || []).find((e) => e.id === card.dataset.entryId);
  if (!entry) return;
  if (button.dataset.action === "tbk-remove") tbkRemove(entry);
  else if (button.dataset.action === "tbk-edit") tbkOpen(entry.playerId);
});

globalThis.renderTeamBlock = renderTeamBlock;
if (!document.querySelector("#team-block-panel").hidden) renderTeamBlock();
