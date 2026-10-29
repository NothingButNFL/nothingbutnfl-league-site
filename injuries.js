// League Injury Report. Entries live in officeData.injuries (league-core.js).
const injRows = document.querySelector("#inj-rows");
const injStatus = document.querySelector("#inj-status");
const injNotice = document.querySelector("#inj-storage-notice");
const injEmpty = document.querySelector("#inj-empty");
const injCount = document.querySelector("#inj-count");
const injSummary = document.querySelector("#inj-status-summary");
const injSearch = document.querySelector("#inj-search");
const injFilterTeam = document.querySelector("#inj-filter-team");
const injFilterStatus = document.querySelector("#inj-filter-status");
const injForm = document.querySelector("#inj-add-form");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  injNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.injuries)) officeData.injuries = [];

function save(message) {
  try {
    writeStoredOffice(officeData);
    injStatus.textContent = message;
  } catch (error) {
    injStatus.textContent = `Could not save: ${error.message}.`;
  }
}

function formatInjDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---- Known players (salary sheets, then Player Contracts) ----
function knownPlayers() {
  const year = currentLeagueYear();
  const list = [];
  for (const { id } of nflTeams) {
    for (const player of officeData.teams[id].roster) {
      if (player.activeSeasons.length && !player.activeSeasons.some((season) => season >= year)) continue;
      const season = player.seasons[year] || player.seasons[player.activeSeasons[player.activeSeasons.length - 1]];
      list.push({ player, teamId: id, position: season?.position || "" });
    }
  }
  const seen = new Set(list.map(({ player }) => player.id));
  for (const player of officeData.contractPlayers || []) {
    if (seen.has(player.id) || !nflTeams.some(({ id }) => id === player.team)) continue;
    list.push({ player, teamId: player.team, position: player.position || "" });
  }
  return list;
}

function matchKnown(name, teamId) {
  const key = normalizePlayerName(name);
  if (!key) return null;
  const matches = knownPlayers().filter(({ player }) => normalizePlayerName(player.name) === key);
  if (teamId) return matches.find((entry) => entry.teamId === teamId) || null;
  return matches.length === 1 ? matches[0] : null;
}

function fillPlayerList() {
  const list = document.querySelector("#inj-player-list");
  list.replaceChildren(...knownPlayers().map(({ player, teamId, position }) => {
    const option = document.createElement("option");
    option.value = player.name;
    option.label = `${position ? `${position} · ` : ""}${teamName(teamId)}`;
    return option;
  }));
}

// ---- Rendering ----
function fillFilters() {
  const keep = [injFilterTeam.value, injFilterStatus.value];
  injFilterTeam.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  injFilterStatus.replaceChildren(new Option("All injured players", ""), new Option("On Injured Reserve", "ir"), new Option("Not on Injured Reserve", "active"));
  [injFilterTeam.value, injFilterStatus.value] = keep;
}

function sortedInjuries() {
  return [...officeData.injuries].sort((a, b) =>
    teamName(a.teamId).localeCompare(teamName(b.teamId)) ||
    Number(Boolean(b.ir)) - Number(Boolean(a.ir)) ||
    a.player.localeCompare(b.player));
}

function editableText(entry, field, label, placeholder = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.value = entry[field] || "";
  input.maxLength = injuryTextLimits[field];
  input.dataset.field = field;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", `${label} for ${entry.player}`);
  input.disabled = !canSave;
  return input;
}

function renderReport() {
  fillFilters();
  const query = injSearch.value.trim().toLowerCase();
  const matchesIr = (entry) => !injFilterStatus.value || (injFilterStatus.value === "ir") === Boolean(entry.ir);
  const beforeStatus = sortedInjuries().filter((entry) =>
    (!injFilterTeam.value || entry.teamId === injFilterTeam.value) &&
    (!query || `${entry.player} ${entry.injury || ""} ${entry.notes || ""}`.toLowerCase().includes(query)));
  const shown = beforeStatus.filter(matchesIr);

  const fragment = document.createDocumentFragment();
  for (const entry of shown) {
    const tr = document.createElement("tr");
    tr.dataset.injId = entry.id;
    const teamCell = tr.insertCell();
    teamCell.className = "inj-team";
    const teamLink = document.createElement("a");
    teamLink.className = "txn-team";
    teamLink.href = `team.html?team=${encodeURIComponent(entry.teamId)}`;
    teamLink.title = teamName(entry.teamId);
    teamLink.textContent = entry.teamId;
    teamCell.append(teamLink);

    const playerCell = tr.insertCell();
    playerCell.className = "inj-player";
    const found = entry.playerId ? findPlayerById(officeData, entry.playerId) : findPlayerByName(officeData, entry.player, entry.teamId);
    if (found) {
      const link = document.createElement("a");
      link.className = "player-name-link";
      link.href = profileUrl(found.player.id);
      link.textContent = entry.player;
      playerCell.append(link);
    } else {
      playerCell.textContent = entry.player;
    }

    tr.insertCell().append(editableText(entry, "position", "Position", "—"));
    tr.insertCell().append(editableText(entry, "injury", "Injury", "—"));

    tr.insertCell().append(editableText(entry, "duration", "Duration", "TBD"));
    const irCell = tr.insertCell();
    irCell.className = "inj-ir";
    const ir = document.createElement("input");
    ir.type = "checkbox";
    ir.dataset.field = "ir";
    ir.checked = Boolean(entry.ir);
    ir.disabled = !canSave;
    ir.setAttribute("aria-label", `${entry.player} on Injured Reserve`);
    irCell.append(ir);
    if (entry.ir) tr.classList.add("is-ir");
    const dateCell = tr.insertCell();
    dateCell.className = "txn-date";
    dateCell.textContent = formatInjDate(entry.date);
    const notesCell = tr.insertCell();
    notesCell.className = "inj-notes";
    notesCell.append(editableText(entry, "notes", "Notes", "—"));

    const actionCell = tr.insertCell();
    const healthy = document.createElement("button");
    healthy.type = "button";
    healthy.className = "row-transaction inj-healthy";
    healthy.dataset.action = "healthy";
    healthy.textContent = "Healthy";
    healthy.setAttribute("aria-label", `Mark ${entry.player} healthy and remove from the report`);
    healthy.disabled = !canSave;
    actionCell.append(healthy);
    fragment.append(tr);
  }
  injRows.replaceChildren(fragment);
  injCount.textContent = shown.length.toLocaleString("en-US");
  injEmpty.hidden = shown.length > 0;
  injEmpty.textContent = officeData.injuries.length
    ? "No injuries match these filters."
    : "No injuries reported. Add a player above when they get hurt.";

  const counts = { ir: beforeStatus.filter((entry) => entry.ir).length, active: beforeStatus.filter((entry) => !entry.ir).length };
  injSummary.replaceChildren(...[["ir", "Injured Reserve"], ["active", "Not on IR"]].map(([id, text]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `txn-chip inj-chip-${id}${injFilterStatus.value === id ? " is-active" : ""}`;
    chip.dataset.status = id;
    const label = document.createElement("span");
    label.textContent = text;
    const count = document.createElement("strong");
    count.textContent = String(counts[id]);
    chip.append(label, count);
    return chip;
  }));
}

for (const control of [injFilterTeam, injFilterStatus]) control.addEventListener("change", renderReport);
injSearch.addEventListener("input", renderReport);
injSummary.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-status]");
  if (!chip) return;
  injFilterStatus.value = injFilterStatus.value === chip.dataset.status ? "" : chip.dataset.status;
  renderReport();
});

// Inline edits
injRows.addEventListener("change", (event) => {
  const input = event.target.closest("[data-field]");
  const tr = input?.closest("tr");
  const entry = tr && officeData.injuries.find(({ id }) => id === tr.dataset.injId);
  if (!entry || !canSave) return;
  const field = input.dataset.field;
  if (field === "ir") {
    entry.ir = input.checked;
    tr.classList.toggle("is-ir", entry.ir);
  } else {
    const value = input.value.trim().slice(0, injuryTextLimits[field]);
    if (value) entry[field] = value; else delete entry[field];
  }
  entry.updatedAt = new Date().toISOString();
  save(`${entry.player}: ${field === "ir" ? (entry.ir ? "placed on Injured Reserve" : "taken off Injured Reserve") : `${field} updated`}.`);
  if (field === "ir") renderReport();
});

injRows.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="healthy"]');
  const tr = button?.closest("tr");
  const entry = tr && officeData.injuries.find(({ id }) => id === tr.dataset.injId);
  if (!entry || !canSave) return;
  const ok = await confirmAction(`Mark ${entry.player} (${entry.teamId}) healthy? They'll be removed from the injury report.`, { confirmLabel: "Mark healthy" });
  if (!ok) return;
  officeData.injuries = officeData.injuries.filter(({ id }) => id !== entry.id);
  save(`${entry.player} marked healthy and removed from the report.`);
  renderReport();
});

// ---- Add one ----
for (const { id, name } of nflTeams) injForm.elements.team.add(new Option(`${name} (${id})`, id));
injForm.elements.team.insertBefore(new Option("Choose a team", ""), injForm.elements.team.firstChild);
injForm.elements.team.value = "";
injForm.elements.date.value = localDateString();

// Choosing a known player fills team and position.
injForm.elements.player.addEventListener("change", () => {
  const known = matchKnown(injForm.elements.player.value);
  if (!known) return;
  injForm.elements.team.value = known.teamId;
  if (!injForm.elements.position.value.trim()) injForm.elements.position.value = known.position;
});

function upsertInjury(fields) {
  const existing = officeData.injuries.find((entry) =>
    entry.teamId === fields.teamId && normalizePlayerName(entry.player) === normalizePlayerName(fields.player));
  const known = matchKnown(fields.player, fields.teamId);
  const record = existing || { id: newRecordId("inj") };
  record.player = fields.player.slice(0, injuryTextLimits.player);
  record.teamId = fields.teamId;
  if (fields.ir !== undefined || !existing) record.ir = Boolean(fields.ir);
  record.date = fields.date;
  if (known) record.playerId = known.player.id;
  for (const field of ["position", "injury", "duration", "notes"]) {
    const value = String(fields[field] || "").trim().slice(0, injuryTextLimits[field]);
    if (value) record[field] = value;
    else if (!existing) delete record[field];
  }
  if (!record.position && known?.position) record.position = known.position;
  record.updatedAt = new Date().toISOString();
  if (!existing) officeData.injuries.push(record);
  return { record, updated: Boolean(existing) };
}

injForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !injForm.reportValidity()) return;
  if (officeData.injuries.length >= 5000) {
    injStatus.textContent = "The injury report has reached its 5,000-player limit.";
    return;
  }
  const f = injForm.elements;
  const { record, updated } = upsertInjury({
    player: f.player.value.trim(), teamId: f.team.value, position: f.position.value, injury: f.injury.value,
    duration: f.duration.value, ir: f.ir.checked, date: f.date.value, notes: f.notes.value
  });
  for (const name of ["player", "position", "injury", "duration", "notes"]) f[name].value = "";
  f.team.value = "";
  f.ir.checked = false;
  save(`${record.player} ${updated ? "updated on" : "added to"} the injury report${record.ir ? " on Injured Reserve" : ""}.`);
  renderReport();
  f.player.focus();
});

// ---- Paste import ----
function injFieldForHeader(header) {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (["player", "playername", "name"].includes(h)) return "player";
  if (["team", "tm", "club"].includes(h)) return "team";
  if (["pos", "position"].includes(h)) return "position";
  if (["injury", "inj", "bodypart", "injurytype", "description"].includes(h)) return "injury";
  if (["duration", "weeks", "length", "timeline", "return", "estreturn", "estimatedreturn", "expectedreturn", "eta", "weeksout"].includes(h)) return "duration";
  if (["ir", "injuredreserve", "reserve", "status", "designation"].includes(h)) return "ir";
  if (["date", "reported", "datereported", "updated"].includes(h)) return "date";
  if (["notes", "note", "comment", "comments"].includes(h)) return "notes";
  return null;
}

// IR column: yes / y / x / true / ir / injured reserve → on IR; anything else (or blank) → not.
function injIrFromText(text) {
  const t = text.toLowerCase().replace(/[^a-z]/g, "");
  return ["yes", "y", "x", "true", "ir", "injuredreserve", "reserve", "onir"].includes(t) || (text.trim() === "✓" || text.trim() === "✔");
}

function injDateFromText(text) {
  const value = text.trim();
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return localDateString(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return localDateString(new Date(year, Number(match[1]) - 1, Number(match[2])));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : localDateString(parsed);
}

document.querySelector("#inj-paste-import").addEventListener("click", () => {
  if (!canSave) return;
  const lines = document.querySelector("#inj-paste-input").value.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => {
    const fields = line.split("\t").map(injFieldForHeader);
    return fields.includes("player") && fields.includes("team");
  });
  if (headerIndex === -1) {
    injStatus.textContent = "Couldn't find a header row with Player and Team columns. Include your header row when you copy. No changes were made.";
    return;
  }
  const columns = new Map();
  lines[headerIndex].split("\t").forEach((cell, index) => {
    const field = injFieldForHeader(cell);
    if (field && !columns.has(field)) columns.set(field, index);
  });
  let added = 0;
  let updated = 0;
  const problems = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = lines[index].split("\t");
    const cell = (field) => (columns.has(field) ? (cells[columns.get(field)] ?? "").trim() : "");
    if (cells.every((value) => !value.trim())) continue;
    const row = `row ${index + 1}`;
    const player = cell("player");
    if (!player) { problems.push(`${row}: no player`); continue; }
    const teamId = lookupTeamId(cell("team"));
    if (!teamId) { problems.push(`${row}: team "${cell("team")}"`); continue; }
    const date = cell("date") ? injDateFromText(cell("date")) : localDateString();
    if (!date) { problems.push(`${row}: date "${cell("date")}"`); continue; }
    if (officeData.injuries.length >= 5000) { problems.push(`${row}: the report is full`); continue; }
    const result = upsertInjury({ player, teamId, date, ir: columns.has("ir") ? injIrFromText(cell("ir")) : undefined, position: cell("position"), injury: cell("injury"), duration: cell("duration"), notes: cell("notes") });
    if (result.updated) updated += 1; else added += 1;
  }
  const parts = [`Added ${added} and updated ${updated} ${added + updated === 1 ? "player" : "players"}.`];
  if (problems.length) parts.push(`Skipped ${problems.length} ${problems.length === 1 ? "row" : "rows"} with problems: ${problems.slice(0, 10).join("; ")}${problems.length > 10 ? "; …" : ""}.`);
  if (added + updated) {
    document.querySelector("#inj-paste-input").value = "";
    document.querySelector("#inj-import-panel").open = false;
    save(parts.join(" "));
  } else {
    injStatus.textContent = parts.join(" ");
  }
  renderReport();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.injuries)) officeData.injuries = [];
    fillPlayerList();
    renderReport();
  } catch {
    injStatus.textContent = "An update from another tab could not be read.";
  }
});

if (!canSave) for (const element of injForm.elements) element.disabled = true;
fillPlayerList();
renderReport();
