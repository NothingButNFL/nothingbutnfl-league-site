// League-wide Player Contracts directory. Data model lives in league-core.js.
// Rows come from two places:
//  - "sheet" players: on a team salary sheet (cap hits come from the sheet)
//  - "directory" players: added on this page; they need no salary sheet
const contractsRows = document.querySelector("#contracts-rows");
const contractsHeader = document.querySelector("#contracts-header");
const contractsStatus = document.querySelector("#contracts-status");
const contractsNotice = document.querySelector("#contracts-storage-notice");
const contractsCount = document.querySelector("#contracts-count");
const contractsEmpty = document.querySelector("#contracts-empty");
const searchInput = document.querySelector("#contracts-search");
const teamFilter = document.querySelector("#contracts-team");
const positionFilter = document.querySelector("#contracts-position");
const faFilter = document.querySelector("#contracts-fa");
const addForm = document.querySelector("#contracts-add-form");

let officeData = emptyOfficeData();
let canSave = true;
let sortState = { key: "aav", direction: -1 }; // highest AAV first; players without an AAV go last

try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  contractsNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}

const columns = [
  { key: "name", label: "PLAYER NAME" },
  { key: "team", label: "TEAM" },
  { key: "position", label: "POS" },
  { key: "age", label: "AGE" },
  { key: "experience", label: "YRS EXP", title: "Accrued seasons: completed NFL seasons, rookies = 0" },
  { key: "faType", label: "FA TYPE" },
  ...seasons.map((year) => ({ key: `cap${year}`, label: String(year), title: `${year} cap hit from the team salary sheet` })),
  { key: "length", label: "LENGTH (YRS)" },
  { key: "totalValue", label: "TOTAL VALUE" },
  { key: "signingBonus", label: "TOTAL SIGNING BONUS" },
  { key: "guaranteed", label: "TOTAL GUARANTEED" },
  { key: "aav", label: "AAV" },
  { key: null, label: "" }
];

const teamOptions = [
  ["", "—"],
  ...nflTeams.map(({ id }) => [id, id]),
  [freeAgentTeamId, "FA"]
];

function contractFields(player) {
  const contract = playerContract(player);
  return {
    age: playerAge(player),
    faType: player.faType || "",
    length: contract.length,
    totalValue: contract.totalValue,
    signingBonus: contract.signingBonus,
    guaranteed: contract.guaranteed,
    aav: contractAav(contract)
  };
}

function allPlayers() {
  const year = currentLeagueYear();
  const sheetRows = nflTeams.flatMap(({ id: teamId }) => officeData.teams[teamId].roster.map((player) => {
    const row = {
      source: "sheet",
      sheetTeamId: teamId,
      player,
      name: player.name,
      team: teamId,
      position: playerDisplayPosition(player, year),
      experience: player.experience ?? null,
      ...contractFields(player)
    };
    for (const season of seasons) {
      row[`cap${season}`] = isPlayerOnSeason(player, season) ? capHitFor(seasonEntry(player, season)) : null;
    }
    return row;
  }));
  const directoryRows = officeData.contractPlayers.map((player) => {
    const row = {
      source: "directory",
      sheetTeamId: "",
      player,
      name: player.name,
      team: player.team,
      position: player.position || "",
      experience: player.experience ?? null,
      ...contractFields(player)
    };
    for (const season of seasons) row[`cap${season}`] = null;
    return row;
  });
  return sheetRows.concat(directoryRows);
}

function fillFilterOptions(rows) {
  const team = teamFilter.value;
  const position = positionFilter.value;
  const fa = faFilter.value;
  teamFilter.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)),
    new Option("Free agents (FA)", freeAgentTeamId), new Option("No team", "__none"));
  const positions = [...new Set(rows.map((row) => row.position).filter(Boolean))].sort();
  positionFilter.replaceChildren(new Option("All positions", ""), ...positions.map((p) => new Option(p, p)));
  const faTypes = [...new Set(rows.map((row) => row.faType).filter(Boolean))].sort();
  faFilter.replaceChildren(new Option("All types", ""), new Option("Not set", "__none"), ...faTypes.map((t) => new Option(t, t)));
  teamFilter.value = team;
  positionFilter.value = positions.includes(position) ? position : "";
  faFilter.value = fa === "__none" || faTypes.includes(fa) ? fa : "";
}

function renderHeader() {
  contractsHeader.replaceChildren(...columns.map((column) => {
    const th = document.createElement("th");
    th.scope = "col";
    if (!column.key) {
      th.innerHTML = '<span class="sr-only">Actions</span>';
      return th;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "contracts-sort";
    button.dataset.sortKey = column.key;
    if (column.title) button.title = column.title;
    const active = sortState.key === column.key;
    button.textContent = `${column.label}${active ? (sortState.direction === 1 ? " ▲" : " ▼") : ""}`;
    th.setAttribute("aria-sort", active ? (sortState.direction === 1 ? "ascending" : "descending") : "none");
    th.append(button);
    return th;
  }));
}

function compareRows(a, b) {
  const { key, direction } = sortState;
  const av = a[key];
  const bv = b[key];
  const blankA = av === null || av === "";
  const blankB = bv === null || bv === "";
  if (blankA !== blankB) return blankA ? 1 : -1; // blanks always last
  let result = 0;
  if (!blankA) result = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
  return result * direction || a.team.localeCompare(b.team) || a.name.localeCompare(b.name);
}

function numberInput(value, field, label, { min = 0, max = 60 } = {}) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.inputMode = "numeric";
  input.value = value ?? "";
  input.placeholder = "—";
  input.dataset.field = field;
  input.setAttribute("aria-label", label);
  return input;
}

function textField(value, field, label, maxLength) {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = maxLength;
  input.value = value;
  input.placeholder = "—";
  input.dataset.field = field;
  input.setAttribute("aria-label", label);
  return input;
}

function moneyInput(value, field, label) {
  const input = textField(value === null || value === undefined ? "" : formatCurrency(value), field, label, 16);
  input.inputMode = "decimal";
  input.dataset.money = "true";
  return input;
}

function parseMoney(text) {
  const raw = String(text).trim().replace(/[$,\s]/g, "").toUpperCase();
  if (!raw) return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)([KM]?)$/);
  if (!match) return undefined;
  const value = Math.round(Number(match[1]) * (match[2] === "M" ? 1e6 : match[2] === "K" ? 1e3 : 1));
  return isIntegerInRange(value, 0, maxContractDollars) ? value : undefined;
}

function renderContracts() {
  const rows = allPlayers();
  fillFilterOptions(rows);
  renderHeader();
  const query = normalizePlayerName(searchInput.value);
  const filtered = rows.filter((row) =>
    (!query || normalizePlayerName(row.name).includes(query)) &&
    (!teamFilter.value || (teamFilter.value === "__none" ? !row.team : row.team === teamFilter.value)) &&
    (!positionFilter.value || row.position === positionFilter.value) &&
    (!faFilter.value || (faFilter.value === "__none" ? !row.faType : row.faType === faFilter.value))
  ).sort(compareRows);

  const year = currentLeagueYear();
  const fragment = document.createDocumentFragment();
  for (const row of filtered) {
    const tr = document.createElement("tr");
    tr.dataset.source = row.source;
    tr.dataset.teamId = row.sheetTeamId;
    tr.dataset.playerId = row.player.id;
    const directory = row.source === "directory";

    const nameCell = tr.insertCell();
    nameCell.className = "contracts-name";
    if (directory) {
      const link = document.createElement("a");
      link.href = profileUrl(row.player.id);
      link.textContent = row.name;
      link.title = `Open ${row.name}'s profile`;
      nameCell.append(link);
    } else {
      const link = document.createElement("a");
      link.href = profileUrl(row.player.id);
      link.textContent = row.name;
      link.title = `Open ${row.name}'s profile`;
      nameCell.append(link);
    }

    const teamCell = tr.insertCell();
    if (directory) {
      const select = document.createElement("select");
      select.dataset.field = "team";
      select.setAttribute("aria-label", `${row.name} team`);
      for (const [value, label] of teamOptions) select.add(new Option(label, value));
      select.value = row.team;
      teamCell.append(select);
    } else {
      teamCell.textContent = row.team;
      teamCell.className = "contracts-sheet-team";
      teamCell.title = "Team comes from the salary sheet";
    }

    const positionCell = tr.insertCell();
    if (directory) positionCell.append(textField(row.position, "position", `${row.name} position`, 8));
    else positionCell.textContent = row.position || "—";

    tr.insertCell().append(numberInput(row.age, "age", `${row.name} age`, { min: 15, max: 60 }));
    const expCell = tr.insertCell();
    expCell.append(numberInput(row.experience, "experience", `${row.name} years of experience (${year})`, { max: 40 }));
    const faInput = textField(row.faType, "faType", `${row.name} free agent type`, 24);
    faInput.setAttribute("list", "fa-type-options");
    tr.insertCell().append(faInput);

    for (const season of seasons) {
      const cell = tr.insertCell();
      cell.className = "contracts-money";
      const value = row[`cap${season}`];
      cell.textContent = value === null ? "—" : formatCurrency(value);
      if (directory && season === firstSeason) cell.title = "Cap hits appear once this player is added to his team's salary sheet";
    }
    tr.insertCell().append(numberInput(row.length, "length", `${row.name} original contract length in years`, { max: 15 }));
    for (const [field, label] of [["totalValue", "total value"], ["signingBonus", "total signing bonus"], ["guaranteed", "total guaranteed"]]) {
      tr.insertCell().append(moneyInput(row[field], field, `${row.name} original contract ${label}`));
    }
    const aavCell = tr.insertCell();
    aavCell.className = "contracts-money contracts-aav";
    aavCell.textContent = row.aav === null ? "—" : formatCurrency(row.aav);

    const actionCell = tr.insertCell();
    if (directory) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "row-delete";
      remove.dataset.action = "delete";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${row.name} from Player Contracts`);
      actionCell.append(remove);
    }
    fragment.append(tr);
  }
  contractsRows.replaceChildren(fragment);
  if (!canSave) contractsRows.querySelectorAll("input, select, button").forEach((input) => { input.disabled = true; });

  document.querySelector("#contracts-total").textContent = rows.length.toLocaleString("en-US");
  contractsCount.textContent = `${filtered.length} of ${rows.length} ${rows.length === 1 ? "player" : "players"}`;
  contractsEmpty.hidden = filtered.length > 0;
  contractsEmpty.textContent = rows.length
    ? "No players match these filters."
    : "No players yet. Add one above, paste rows from your spreadsheet, or add players on a team salary sheet.";
}

function save(message) {
  try {
    writeStoredOffice(officeData);
    contractsStatus.textContent = message;
  } catch (error) {
    contractsStatus.textContent = `Could not save: ${error.message}.`;
  }
}

function findRowPlayer(tr) {
  if (tr.dataset.source === "directory") return officeData.contractPlayers.find(({ id }) => id === tr.dataset.playerId);
  return officeData.teams[tr.dataset.teamId]?.roster.find(({ id }) => id === tr.dataset.playerId);
}

// After a directory player's name or team changes, fold them into a matching
// salary-sheet player if one now exists.
function mergeAndReport(player) {
  if (mergeDirectoryIntoRosters(officeData)) {
    save(`${player.name} matches a player on the ${teamName(player.team)} salary sheet, so the two rows were combined and cap hits now show.`);
    renderContracts();
    return true;
  }
  return false;
}

contractsRows.addEventListener("change", (event) => {
  const input = event.target.closest("[data-field]");
  const tr = input?.closest("tr");
  if (!input || !tr || !canSave) return;
  const player = findRowPlayer(tr);
  if (!player) return;
  const directory = tr.dataset.source === "directory";
  const field = input.dataset.field;
  const raw = input.value.trim();
  const fail = (message) => {
    input.setCustomValidity(message);
    input.reportValidity();
    input.setCustomValidity("");
    renderContracts();
  };

  if (directory && field === "name") {
    if (!raw || raw.length > 70) return fail("Enter a player name up to 70 characters.");
    player.name = raw;
    if (!mergeAndReport(player)) save(`Renamed to ${raw}.`);
    return;
  }
  if (directory && field === "team") {
    player.team = input.value;
    if (!mergeAndReport(player)) {
      save(`${player.name} moved to ${input.value === freeAgentTeamId ? "free agency" : input.value ? teamName(input.value) : "no team"}.`);
    }
    return;
  }
  if (directory && field === "position") {
    player.position = raw.toUpperCase().slice(0, 8);
    input.value = player.position;
    save(`${player.name}'s position updated.`);
    return;
  }
  if (field === "faType") {
    player.faType = raw;
    save(`${player.name}'s free agent type ${raw ? "set to " + raw : "cleared"}.`);
    return;
  }
  if (field === "age" || field === "experience" || field === "length") {
    const value = raw === "" ? null : Number(raw);
    const [min, max] = field === "age" ? [15, 60] : field === "experience" ? [0, 40] : [0, 15];
    if (value !== null && !isIntegerInRange(value, min, max)) return fail(`Enter a whole number from ${min} to ${max}, or leave it blank.`);
    if (field === "age") {
      player.age = value;
      player.birthDate = null; // a typed age replaces the NFL birth date
    } else if (field === "experience") {
      player.experience = value;
    } else {
      player.contract = { ...playerContract(player), length: value };
    }
  } else if (contractMoneyFields.includes(field)) {
    const value = parseMoney(raw);
    if (value === undefined) return fail("Enter a whole dollar amount, such as $45,000,000 or 45M.");
    player.contract = { ...playerContract(player), [field]: value };
  } else {
    return;
  }
  save(`${player.name} updated.`);
  // Update this row in place so keyboard focus moves on to the next cell normally.
  if (input.dataset.money) {
    const value = playerContract(player)[field];
    input.value = value === null ? "" : formatCurrency(value);
  }
  const aav = contractAav(playerContract(player));
  tr.querySelector(".contracts-aav").textContent = aav === null ? "—" : formatCurrency(aav);
});

contractsRows.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="delete"]');
  const tr = button?.closest("tr");
  if (!tr || !canSave) return;
  const player = findRowPlayer(tr);
  if (!player) return;
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
  officeData.contractPlayers = officeData.contractPlayers.filter(({ id }) => id !== player.id);
  save(`${player.name} removed from Player Contracts.`);
  renderContracts();
});

contractsRows.addEventListener("focusin", (event) => {
  const input = event.target.closest("[data-money]");
  if (input) input.value = input.value.replace(/[$,\s]/g, "");
});

contractsRows.addEventListener("focusout", (event) => {
  const input = event.target.closest("[data-money]");
  const value = input && parseMoney(input.value);
  if (input && typeof value === "number") input.value = formatCurrency(value);
});

contractsHeader.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort-key]");
  if (!button) return;
  const key = button.dataset.sortKey;
  sortState = sortState.key === key ? { key, direction: -sortState.direction } : { key, direction: 1 };
  renderContracts();
});

for (const control of [teamFilter, positionFilter, faFilter]) control.addEventListener("change", renderContracts);
searchInput.addEventListener("input", renderContracts);

// ---- Add a single player ----
const addTeamSelect = addForm.elements.team;
for (const [value] of teamOptions) {
  addTeamSelect.add(new Option(value ? (value === freeAgentTeamId ? "Free agent (FA)" : `${teamName(value)} (${value})`) : "No team", value));
}
addTeamSelect.value = freeAgentTeamId;

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !addForm.reportValidity()) return;
  const name = addForm.elements.name.value.trim();
  const team = addTeamSelect.value;
  if (!name) return;
  if (officeData.contractPlayers.length >= 10000) {
    contractsStatus.textContent = "Player Contracts has reached its 10,000-player limit.";
    return;
  }
  const player = { id: newRecordId("contract"), name, team, position: addForm.elements.position.value.trim().toUpperCase().slice(0, 8), experience: null };
  officeData.contractPlayers.push(player);
  addForm.elements.name.value = "";
  addForm.elements.position.value = "";
  if (!mergeAndReport(player)) {
    save(`${name} added${team ? ` to ${team === freeAgentTeamId ? "free agency" : teamName(team)}` : ""}.`);
    renderContracts();
  }
  addForm.elements.name.focus();
});

// ---- Fill age and experience from the NFL roster snapshot ----
document.querySelector("#fill-ages").addEventListener("click", () => {
  if (!canSave) return;
  if (typeof nflExperienceSnapshot === "undefined") {
    contractsStatus.textContent = "NFL roster data could not be loaded. No changes were made.";
    return;
  }
  const year = currentLeagueYear();
  const yearOffset = Math.max(0, year - nflExperienceSnapshot.season);
  let ages = 0;
  let experiences = 0;
  let bios = 0;
  const overwrite = document.querySelector("#fill-overwrite").checked;
  const missed = [];
  const people = [
    ...nflTeams.flatMap(({ id }) => officeData.teams[id].roster.map((player) => ({ player, team: id, sheet: true }))),
    ...officeData.contractPlayers.map((player) => ({ player, team: player.team, sheet: false }))
  ];
  if (!people.length) {
    contractsStatus.textContent = "No players yet.";
    return;
  }
  for (const { player, team, sheet } of people) {
    const position = sheet ? playerDisplayPosition(player, year) : player.position;
    const match = matchNflExperience(player.name, position, team || null);
    if (!match.record) {
      missed.push(player.name);
      continue;
    }
    if (match.record.birthDate) {
      player.birthDate = match.record.birthDate;
      player.age = null;
      ages += 1;
    }
    // Bio blanks for the player profile (college, size, draft) — never overwrites.
    const profile = playerProfile(player);
    let bioChanged = false;
    if (!profile.college && match.record.college) { profile.college = match.record.college; bioChanged = true; }
    if (!profile.height && match.record.height) { profile.height = formatHeight(match.record.height); bioChanged = true; }
    if (!profile.weight && match.record.weight) { profile.weight = match.record.weight; bioChanged = true; }
    if (!profile.draftYear && match.record.draftYear) {
      Object.assign(profile, { draftYear: match.record.draftYear, draftRound: match.record.draftRound || null, draftPick: match.record.draftPick || null });
      bioChanged = true;
    }
    if (bioChanged) { player.profile = profile; bios += 1; }
    const experience = Math.min(40, match.experience + yearOffset);
    if (overwrite || player.experience == null) {
      player.experience = experience;
      experiences += 1;
    }
  }
  const missedText = missed.length
    ? ` No NFL match for ${missed.length}: ${missed.slice(0, 12).join(", ")}${missed.length > 12 ? ", …" : ""}.`
    : "";
  save(`Set ${ages} ages from NFL birth dates (they stay current automatically) and ${overwrite ? "set" : "filled"} ${experiences} ${overwrite ? "" : "blank "}experience values (completed seasons, rookies = 0). Filled profile bios (college, height, weight, draft) for ${bios} ${bios === 1 ? "player" : "players"}.${missedText}`);
  renderContracts();
});

// ---- Paste import ----
// Header text → field. Exact names first, then looser "contains" rules so
// headers like "Original Contract Length" or "Total Signing Bonus" still match.
function pasteFieldForHeader(header) {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!h || /^20\d\d$/.test(h) || h.includes("caphit") || h === "aav" || h.includes("averageannual")) return null;
  const exact = {
    playername: "name", player: "name", name: "name", fullname: "name",
    team: "team", tm: "team", currentteam: "team",
    pos: "position", position: "position",
    age: "age",
    exp: "experience", yrsexp: "experience", yearsexp: "experience", experience: "experience",
    yearsofexperience: "experience", yearsexperience: "experience",
    fatype: "faType", freeagenttype: "faType", fa: "faType", fastatus: "faType", freeagent: "faType", freeagency: "faType",
    length: "length", years: "length", yrs: "length", contractlength: "length", contractyears: "length",
    totalvalue: "totalValue", value: "totalValue", contractvalue: "totalValue",
    signingbonus: "signingBonus", totalsigningbonus: "signingBonus", bonus: "signingBonus",
    guaranteed: "guaranteed", totalguaranteed: "guaranteed", gtd: "guaranteed", guarantees: "guaranteed", totalgtd: "guaranteed"
  };
  if (exact[h]) return exact[h];
  if (h.includes("signing")) return "signingBonus";
  if (h.includes("guarant") || h.endsWith("gtd")) return "guaranteed";
  if (h.includes("length") || h.endsWith("years")) return "length";
  if (h.includes("totalvalue") || h.endsWith("value")) return "totalValue";
  if (h.includes("freeagent") || h.includes("fatype")) return "faType";
  if (h.includes("experience")) return "experience";
  if (h.includes("playername")) return "name";
  return null;
}

function teamIdFromText(text) {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  if (isFreeAgentText(value)) return freeAgentTeamId;
  return lookupTeamId(value) || undefined;
}

const blankCell = (text) => text === undefined || /^(|-|–|—|n\/?a|none)$/i.test(text.trim());

// Parses one pasted row. Returns { changes } or { error }.
function parseContractRow(cell) {
  const changes = {};
  const age = cell("age");
  if (!blankCell(age)) {
    const value = Math.floor(Number(age));
    if (!isIntegerInRange(value, 15, 60)) return { error: `age "${age}" isn't a number from 15 to 60` };
    changes.age = value;
  }
  const experience = cell("experience");
  if (!blankCell(experience)) {
    const value = /^r(ookie)?$/i.test(experience.trim()) ? 1 : Number(experience);
    if (!isIntegerInRange(value, 0, 40)) return { error: `experience "${experience}" isn't whole years from 0 to 40` };
    changes.experience = value;
  }
  const faType = cell("faType");
  if (!blankCell(faType)) {
    if (faType.trim().length > 24) return { error: "free agent type is longer than 24 characters" };
    changes.faType = faType.trim();
  }
  const position = cell("position");
  if (!blankCell(position)) changes.position = position.trim().toUpperCase().slice(0, 8);
  const length = cell("length");
  if (!blankCell(length)) {
    const value = Number(length.replace(/\s*(yrs?|years?)$/i, ""));
    if (!isIntegerInRange(value, 0, 15)) return { error: `length "${length}" isn't whole years from 0 to 15` };
    changes.length = value;
  }
  for (const field of contractMoneyFields) {
    const text = cell(field);
    if (blankCell(text)) continue;
    const value = parseMoney(text);
    if (value === undefined || value === null) return { error: `"${text}" isn't a dollar amount` };
    changes[field] = value;
  }
  return { changes };
}

function applyContractChanges(player, source, changes) {
  if (changes.age !== undefined) {
    player.age = changes.age;
    player.birthDate = null;
  }
  if (changes.faType !== undefined) player.faType = changes.faType;
  if (changes.experience !== undefined) {
    player.experience = changes.experience;
  }
  if (changes.position !== undefined && source === "directory") player.position = changes.position;
  const contractChanges = Object.fromEntries(["length", ...contractMoneyFields]
    .filter((field) => changes[field] !== undefined).map((field) => [field, changes[field]]));
  if (Object.keys(contractChanges).length) player.contract = { ...playerContract(player), ...contractChanges };
}

const listNames = (names) => `${names.slice(0, 10).join(", ")}${names.length > 10 ? `, and ${names.length - 10} more` : ""}`;

document.querySelector("#contracts-paste-import").addEventListener("click", () => {
  if (!canSave) return;
  const lines = document.querySelector("#contracts-paste-input").value.replace(/^﻿/, "").split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) {
    contractsStatus.textContent = "Paste a header row and at least one player row.";
    return;
  }
  // Use the first line that has a Player Name column as the header row.
  const headerIndex = lines.findIndex((line) => line.split("\t").some((cell) => pasteFieldForHeader(cell) === "name"));
  if (headerIndex === -1) {
    contractsStatus.textContent = "Couldn't find a header row with a Player Name column. Include your spreadsheet's header row when you copy. No changes were made.";
    return;
  }
  const columnsFound = new Map();
  lines[headerIndex].split("\t").forEach((cell, index) => {
    const field = pasteFieldForHeader(cell);
    if (field && !columnsFound.has(field)) columnsFound.set(field, index);
  });

  // Every existing player, from salary sheets and from this page's directory.
  const byName = new Map();
  const remember = (entry) => {
    const key = normalizePlayerName(entry.player.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(entry);
  };
  for (const { id } of nflTeams) officeData.teams[id].roster.forEach((player) => remember({ source: "sheet", team: id, player }));
  officeData.contractPlayers.forEach((player) => remember({ source: "directory", team: player.team, player }));

  let updated = 0;
  const added = [];
  const unknownTeams = [];
  const ambiguous = [];
  const badRows = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = lines[index].split("\t");
    const cell = (field) => (columnsFound.has(field) ? (cells[columnsFound.get(field)] ?? "").trim() : undefined);
    const name = (cell("name") || "").trim();
    if (!name) continue; // blank or subtotal rows
    if (name.length > 70) {
      badRows.push(`row ${index + 1} (name too long)`);
      continue;
    }
    const parsed = parseContractRow(cell);
    if (parsed.error) {
      badRows.push(`${name}: ${parsed.error}`);
      continue;
    }
    const teamText = cell("team") || "";
    const teamId = teamIdFromText(teamText);
    if (teamId === undefined) {
      unknownTeams.push(`${name} (${teamText})`);
      continue;
    }
    const sameName = byName.get(normalizePlayerName(name)) || [];
    let match = null;
    if (teamId) {
      const onTeam = sameName.filter((entry) => entry.team === teamId);
      if (onTeam.length > 1) {
        ambiguous.push(name);
        continue;
      }
      if (onTeam.length === 1) {
        match = onTeam[0];
      } else {
        // Only this page knows him, under another team: treat it as a move.
        const movable = sameName.filter((entry) => entry.source === "directory");
        if (movable.length === 1 && !sameName.some((entry) => entry.source === "sheet")) {
          match = movable[0];
          match.player.team = teamId;
          match.team = teamId;
        }
      }
    } else if (sameName.length > 1) {
      ambiguous.push(name);
      continue;
    } else if (sameName.length === 1) {
      match = sameName[0];
    }
    if (match) {
      applyContractChanges(match.player, match.source, parsed.changes);
      updated += 1;
      continue;
    }
    if (officeData.contractPlayers.length >= 10000) {
      badRows.push(`${name}: Player Contracts is full`);
      continue;
    }
    const player = { id: newRecordId("contract"), name, team: teamId || "", position: "", experience: null };
    applyContractChanges(player, "directory", parsed.changes);
    officeData.contractPlayers.push(player);
    remember({ source: "directory", team: player.team, player });
    added.push(name);
  }

  const merged = mergeDirectoryIntoRosters(officeData);
  const parts = [`Updated ${updated} and added ${added.length} ${updated + added.length === 1 ? "player" : "players"}.`];
  if (merged) parts.push(`${merged} matched players already on their team's salary sheet and were combined with them.`);
  if (unknownTeams.length) parts.push(`Team not recognized, so skipped: ${listNames(unknownTeams)}.`);
  if (ambiguous.length) parts.push(`More than one player has this name, add a Team column: ${listNames(ambiguous)}.`);
  if (badRows.length) parts.push(`Skipped rows with problems: ${listNames(badRows)}.`);
  if (updated || added.length) {
    document.querySelector("#contracts-paste-input").value = "";
    document.querySelector("#contracts-import-panel").open = false;
    save(parts.join(" "));
  } else {
    contractsStatus.textContent = parts.join(" ");
  }
  renderContracts();
  contractsStatus.scrollIntoView({ behavior: "smooth", block: "center" });
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    renderContracts();
  } catch {
    contractsStatus.textContent = "An update from another tab could not be read.";
  }
});

renderContracts();
