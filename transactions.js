// League Transaction Log. Entries live in officeData.transactions (league-core.js).
// Approved trades and salary-sheet releases add entries automatically.
const txnRows = document.querySelector("#txn-rows");
const txnStatus = document.querySelector("#txn-status");
const txnNotice = document.querySelector("#txn-storage-notice");
const txnEmpty = document.querySelector("#txn-empty");
const txnCount = document.querySelector("#txn-count");
const txnSummary = document.querySelector("#txn-type-summary");
const searchInput = document.querySelector("#txn-search");
const filterType = document.querySelector("#txn-filter-type");
const filterTeam = document.querySelector("#txn-filter-team");
const filterYear = document.querySelector("#txn-filter-year");
const addForm = document.querySelector("#txn-add-form");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
  // Save once so trades approved before the log existed stay in it.
  if (officeData.transactions.length && !localStorage.getItem(officeStorageKey)?.includes('"transactions"')) {
    writeStoredOffice(officeData);
  }
} catch (error) {
  canSave = false;
  txnNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}

const teamChoices = [...nflTeams.map(({ id, name }) => [id, `${name} (${id})`]), [freeAgentTeamId, "Free agent (FA)"]];
const teamText = (id) => (id === freeAgentTeamId ? "FA" : id);

function save(message) {
  try {
    writeStoredOffice(officeData);
    txnStatus.textContent = message;
  } catch (error) {
    txnStatus.textContent = `Could not save: ${error.message}.`;
  }
}

function sortedEntries() {
  return [...officeData.transactions].sort((a, b) =>
    b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function fillFilters() {
  const keep = [filterType.value, filterTeam.value, filterYear.value];
  filterType.replaceChildren(new Option("All types", ""), ...Object.entries(transactionTypes).map(([id, label]) => new Option(label, id)));
  filterTeam.replaceChildren(new Option("All teams", ""), ...teamChoices.map(([id, label]) => new Option(label, id)));
  const years = [...new Set(officeData.transactions.map((entry) => entry.date.slice(0, 4)))].sort().reverse();
  filterYear.replaceChildren(new Option("All years", ""), ...years.map((year) => new Option(year, year)));
  filterType.value = keep[0];
  filterTeam.value = keep[1];
  filterYear.value = years.includes(keep[2]) ? keep[2] : "";
}

function formatLogDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Escapes text and turns **bold** into <strong>, keeping line breaks.
function richText(text) {
  const span = document.createElement("div");
  span.className = "txn-rich";
  const escaped = String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  span.innerHTML = escaped.replace(/\*\*\s*(.+?)\s*\*\*/g, "<strong>$1</strong>");
  return span;
}

function renderDetails(cell, entry) {
  if (entry.type !== "trade") {
    cell.append(entry.details ? richText(entry.details) : document.createTextNode("—"));
    return;
  }
  const head = document.createElement("p");
  head.className = "txn-trade-head";
  const label = document.createElement("strong");
  label.append("Trade ");
  const number = document.createElement("input");
  number.type = "number";
  number.min = "1";
  number.max = "1000000";
  number.step = "1";
  number.value = entry.tradeNumber ?? "";
  number.dataset.field = "tradeNumber";
  number.className = "txn-trade-number";
  const fit = () => { number.style.setProperty("width", `${Math.max(2, String(number.value).length) + 2}ch`, "important"); };
  fit();
  number.addEventListener("input", fit);
  number.setAttribute("aria-label", "Trade number");
  number.title = "Trade number (edit to renumber)";
  if (!canSave) number.disabled = true;
  label.append(number, ":");
  head.append(label);
  cell.append(head);
  if (entry.sides) {
    for (const side of entry.sides) {
      const title = document.createElement("p");
      title.className = "txn-trade-side";
      const strong = document.createElement("strong");
      strong.textContent = `${teamName(side.teamId)} Trade:`;
      title.append(strong);
      const list = document.createElement("ul");
      for (const item of side.items.length ? side.items : ["Nothing"]) {
        const li = document.createElement("li");
        li.textContent = item;
        list.append(li);
      }
      cell.append(title, list);
    }
  } else if (entry.details) {
    // Typed or pasted trades: show their text without repeating the "Trade N:" line.
    cell.append(richText(entry.details.replace(/^\s*\**\s*trade\s*#?\s*\d+\s*:?\s*\**\s*\n*/i, "")));
  }
}

// "Trade 112" in typed or pasted details sets the trade number.
function tradeNumberFromText(text) {
  const match = String(text || "").match(/trade\s*#?\s*(\d{1,7})/i);
  return match ? Number(match[1]) : undefined;
}

function renderNextTradeNumber() {
  const input = document.querySelector("#txn-next-trade");
  if (document.activeElement !== input) input.value = String(nextTradeNumber(officeData));
}

function renderLog() {
  renderNextTradeNumber();
  fillFilters();
  const query = searchInput.value.trim().toLowerCase();
  const beforeType = sortedEntries().filter((entry) =>
    (!filterTeam.value || entry.teams.includes(filterTeam.value)) &&
    (!filterYear.value || entry.date.startsWith(filterYear.value)) &&
    (!query || `${entry.player || ""} ${entry.details}`.toLowerCase().includes(query)));
  const shown = beforeType.filter((entry) => !filterType.value || entry.type === filterType.value);

  const fragment = document.createDocumentFragment();
  for (const entry of shown) {
    const tr = document.createElement("tr");
    tr.dataset.txnId = entry.id;
    const dateCell = tr.insertCell();
    dateCell.className = "txn-date";
    dateCell.textContent = formatLogDate(entry.date);
    const typeCell = tr.insertCell();
    const badge = document.createElement("span");
    badge.className = `txn-badge txn-${entry.type}`;
    badge.textContent = transactionTypes[entry.type];
    typeCell.append(badge);
    if (entry.auto) {
      const auto = document.createElement("small");
      auto.className = "txn-auto";
      auto.textContent = "auto";
      auto.title = entry.type === "trade" ? "Logged when the commissioner approved the trade" : "Logged from the team salary sheet";
      typeCell.append(auto);
    }
    const teamCell = tr.insertCell();
    teamCell.className = "txn-teams";
    if (!entry.teams.length) teamCell.textContent = "—";
    for (const id of entry.teams) {
      const tag = document.createElement(id === freeAgentTeamId ? "span" : "a");
      tag.className = "txn-team";
      tag.textContent = teamText(id);
      if (id !== freeAgentTeamId) {
        tag.href = `team.html?team=${encodeURIComponent(id)}`;
        tag.title = teamName(id);
      }
      teamCell.append(tag);
    }
    const playerCell = tr.insertCell();
    playerCell.className = "txn-player";
    playerCell.textContent = entry.player || "—";
    const detailsCell = tr.insertCell();
    detailsCell.className = "txn-details";
    renderDetails(detailsCell, entry);
    const actionCell = tr.insertCell();
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-delete";
    remove.dataset.action = "delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove this transaction from the log");
    if (!canSave) remove.disabled = true;
    actionCell.append(remove);
    fragment.append(tr);
  }
  txnRows.replaceChildren(fragment);
  txnCount.textContent = shown.length.toLocaleString("en-US");
  txnEmpty.hidden = shown.length > 0;
  txnEmpty.textContent = officeData.transactions.length
    ? "No transactions match these filters."
    : "No transactions yet. Approved trades and releases appear here automatically, or add one above.";

  // Counts per type (using every filter except Type); click to filter.
  const counts = Object.fromEntries(Object.keys(transactionTypes).map((type) => [type, 0]));
  for (const entry of beforeType) counts[entry.type] += 1;
  txnSummary.replaceChildren(...Object.entries(transactionTypes).map(([type, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `txn-chip txn-${type}${filterType.value === type ? " is-active" : ""}`;
    chip.dataset.type = type;
    chip.innerHTML = `<span></span><strong></strong>`;
    chip.firstChild.textContent = label;
    chip.lastChild.textContent = String(counts[type]);
    return chip;
  }));
}

for (const control of [filterType, filterTeam, filterYear]) control.addEventListener("change", renderLog);
searchInput.addEventListener("input", renderLog);
txnSummary.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-type]");
  if (!chip) return;
  filterType.value = filterType.value === chip.dataset.type ? "" : chip.dataset.type;
  renderLog();
});

txnRows.addEventListener("change", (event) => {
  const input = event.target.closest('[data-field="tradeNumber"]');
  const tr = input?.closest("tr");
  const entry = tr && officeData.transactions.find(({ id }) => id === tr.dataset.txnId);
  if (!entry || !canSave) return;
  const value = Number(input.value);
  if (!isIntegerInRange(value, 1, 1000000)) {
    input.value = entry.tradeNumber ?? "";
    txnStatus.textContent = "Enter a whole trade number from 1 up.";
    return;
  }
  entry.tradeNumber = value;
  if (entry.sides) entry.details = tradeDetailsText(entry);
  const duplicate = officeData.transactions.some((other) => other !== entry && other.tradeNumber === value);
  save(`Renumbered to Trade ${value}.${duplicate ? ` Another trade already uses ${value}.` : ""}`);
  renderNextTradeNumber();
});

document.querySelector("#txn-next-trade").addEventListener("change", (event) => {
  if (!canSave) return;
  const value = Number(event.target.value);
  const highest = officeData.transactions.reduce((max, entry) => Math.max(max, entry.tradeNumber || 0), 0);
  if (!isIntegerInRange(value, 1, 1000000)) {
    renderNextTradeNumber();
    return;
  }
  officeData.tradeNumberNext = value;
  save(value <= highest
    ? `Trade ${highest} is already logged, so the next approved trade will be Trade ${highest + 1}. Renumber the logged trades first to start lower.`
    : `The next approved trade will be logged as Trade ${value}.`);
  renderNextTradeNumber();
});

txnRows.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="delete"]');
  const tr = button?.closest("tr");
  if (!tr || !canSave) return;
  if (!button.classList.contains("is-armed")) {
    button.classList.add("is-armed");
    button.textContent = "Remove?";
    setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove("is-armed");
      button.textContent = "×";
    }, 4000);
    return;
  }
  officeData.transactions = officeData.transactions.filter(({ id }) => id !== tr.dataset.txnId);
  save("Transaction removed from the log. Rosters, contracts and picks were not changed.");
  renderLog();
});

// ---- Add one ----
for (const [id, label] of Object.entries(transactionTypes)) {
  if (id !== "trade") addForm.elements.type.add(new Option(label, id));
}
addForm.elements.type.add(new Option(transactionTypes.trade, "trade"));
for (const [id, label] of teamChoices) addForm.elements.team.add(new Option(label, id));
addForm.elements.date.value = localDateString();
addForm.elements.type.value = "signing";

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !addForm.reportValidity()) return;
  const details = addForm.elements.details.value.trim();
  const entry = logTransaction(officeData, {
    date: addForm.elements.date.value,
    type: addForm.elements.type.value,
    teams: [addForm.elements.team.value],
    player: addForm.elements.player.value.trim(),
    details,
    tradeNumber: tradeNumberFromText(details)
  });
  if (!entry) {
    txnStatus.textContent = "The log has reached its 20,000-entry limit.";
    return;
  }
  addForm.elements.player.value = "";
  addForm.elements.details.value = "";
  save(`${transactionTypes[entry.type]} added to the log${entry.player ? ` for ${entry.player}` : ""}.`);
  renderLog();
  addForm.elements.player.focus();
});

// ---- Paste import ----
function txnFieldForHeader(header) {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (["date", "day", "transactiondate"].includes(h)) return "date";
  if (["type", "transaction", "transactiontype", "move", "action"].includes(h)) return "type";
  if (["team", "tm", "club", "teams"].includes(h)) return "team";
  if (["player", "playername", "name", "players"].includes(h)) return "player";
  if (["details", "detail", "notes", "note", "description", "terms", "contract"].includes(h)) return "details";
  return null;
}

function txnTypeFromText(text) {
  const t = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return null;
  if (t.startsWith("trade")) return "trade";
  if (t.startsWith("releas") || t === "cut" || t.startsWith("cut")) return "release";
  if (t.startsWith("waive") || t.includes("waiver") || t.includes("claim")) return "waiver";
  if (t.startsWith("exten") || t.includes("resign") || t.includes("restructure")) return "extension";
  if (t.includes("sign") || t.includes("freeagent") || t === "fa") return "signing";
  if (t === "other") return "other";
  return undefined;
}

function txnTeamFromText(text) {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  if (isFreeAgentText(value)) return freeAgentTeamId;
  return lookupTeamId(value) || undefined;
}

function txnDateFromText(text) {
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

document.querySelector("#txn-paste-import").addEventListener("click", () => {
  if (!canSave) return;
  const lines = document.querySelector("#txn-paste-input").value.replace(/^﻿/, "").split(/\r?\n/)
    .filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => {
    const fields = line.split("\t").map(txnFieldForHeader);
    return fields.includes("type") && (fields.includes("player") || fields.includes("details"));
  });
  if (headerIndex === -1) {
    txnStatus.textContent = "Couldn't find a header row with a Type column and a Player or Details column. Include your header row when you copy. No changes were made.";
    return;
  }
  const columns = new Map();
  lines[headerIndex].split("\t").forEach((cell, index) => {
    const field = txnFieldForHeader(cell);
    if (field && !columns.has(field)) columns.set(field, index);
  });
  let added = 0;
  const problems = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = lines[index].split("\t");
    const cell = (field) => (columns.has(field) ? (cells[columns.get(field)] ?? "").trim() : "");
    if (cells.every((value) => !value.trim())) continue;
    const row = `row ${index + 1}`;
    const type = txnTypeFromText(cell("type"));
    if (!type) { problems.push(`${row}: type "${cell("type")}"`); continue; }
    const date = cell("date") ? txnDateFromText(cell("date")) : localDateString();
    if (!date) { problems.push(`${row}: date "${cell("date")}"`); continue; }
    // A Team cell may list several teams for trades: "KC / BUF" or "KC, BUF".
    const teamParts = cell("team").split(/\s*(?:\/|,|&|\band\b)\s*/i).filter(Boolean);
    const teams = teamParts.map(txnTeamFromText);
    if (teams.some((team) => team === undefined) || teams.length > 3) { problems.push(`${row}: team "${cell("team")}"`); continue; }
    const entry = logTransaction(officeData, {
      date, type, teams: [...new Set(teams)], player: cell("player"), details: cell("details"),
      tradeNumber: type === "trade" ? tradeNumberFromText(cell("details")) : undefined
    });
    if (!entry) { problems.push(`${row}: the log is full`); continue; }
    added += 1;
  }
  const parts = [`Added ${added} ${added === 1 ? "transaction" : "transactions"} to the log.`];
  if (problems.length) {
    parts.push(`Skipped ${problems.length} ${problems.length === 1 ? "row" : "rows"} with problems: ${problems.slice(0, 10).join("; ")}${problems.length > 10 ? "; …" : ""}.`);
  }
  if (added) {
    document.querySelector("#txn-paste-input").value = "";
    document.querySelector("#txn-import-panel").open = false;
    save(parts.join(" "));
  } else {
    txnStatus.textContent = parts.join(" ");
  }
  renderLog();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    renderLog();
  } catch {
    txnStatus.textContent = "An update from another tab could not be read.";
  }
});

renderLog();
