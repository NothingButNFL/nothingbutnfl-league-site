const deadCapRows = document.querySelector("#dead-cap-rows");
const deadCapPasteInput = document.querySelector("#dead-cap-paste-input");
const salaryRows = document.querySelector("#salary-rows");
const picksRows = document.querySelector("#pick-rows");
const salaryPasteInput = document.querySelector("#salary-paste-input");
const salaryImportPanel = document.querySelector("#salary-import-panel");
const storageNotice = document.querySelector("#storage-notice");
const workspaceStatus = document.querySelector("#workspace-status");
const salaryEmpty = document.querySelector("#salary-empty");
const requestedTeamId = new URLSearchParams(window.location.search).get("team")?.toUpperCase();
let activeTeamId = nflTeams.some(({ id }) => id === requestedTeamId) ? requestedTeamId : nflTeams[0].id;
let activeSeason = firstSeason;
let activeTab = location.hash === "#depth-chart" ? "depth-chart" : "salary"; // #depth-chart opens that tab (links from Stream Updates)
let officeData = emptyOfficeData(activeTeamId);
let storageIsAvailable = true;
let tradePartnerIds = ["", ""];
let tradeLines = {};
let tradeLineCounter = 0;


async function recordRosterTransaction(player, transaction) {
  const year = currentLeagueYear();
  if (activeSeason !== year || !seasons.includes(year)) {
    workspaceStatus.textContent = `Trade or release actions are available only on the current league year's (${year}) salary sheet.`;
    return;
  }
  const penalties = calculatedPenaltiesFor(player, year);
  if (!penalties) {
    workspaceStatus.textContent = `Could not calculate ${transaction} dead cap for ${year}. No changes were made.`;
    return;
  }
  const currentAmount = penalties[transaction === "trade" ? "tradePenalty" : "releasePenalty"];
  const futureAmount = penalties[transaction === "trade" ? "futureTradeDeadCap" : "futureReleaseDeadCap"];
  const nextYear = year + 1;
  const futureIsTrackable = futureAmount > 0 && deadCapSeasons.includes(nextYear);
  const team = selectedTeamData();
  if (team.deadCap[year].length >= 5000 ||
      (futureIsTrackable && team.deadCap[nextYear].length >= 5000)) {
    workspaceStatus.textContent = "The dead-cap table has reached its 5,000-entry limit. No changes were made.";
    return;
  }
  const summary = `${player.name} will be recorded as ${transaction === "trade" ? "traded" : "released"} with ${formatCurrency(currentAmount)} on the ${year} dead-cap table` +
    (futureIsTrackable ? ` and ${formatCurrency(futureAmount)} on the ${nextYear} dead-cap table` :
      futureAmount > 0 ? `; future dead cap is not tracked because the ledger covers only ${deadCapSeasons.join(" and ")}` : "") +
    `. Their ${year} and later salary sheets will be removed.`;
  const confirmed = await confirmAction(summary, { confirmLabel: transaction === "trade" ? `Trade ${player.name}` : `Release ${player.name}`, danger: true });
  if (!confirmed) {
    workspaceStatus.textContent = `${transaction === "trade" ? "Trade" : "Release"} canceled. No changes were made.`;
    return;
  }

  const date = new Date().toISOString();
  const makeRecord = (amount) => ({
    id: globalThis.crypto?.randomUUID?.() || `dead-cap-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    playerName: player.name,
    position: seasonEntry(player, year).position,
    transaction,
    transactionYear: year,
    amount,
    date
  });
  team.deadCap[year].push(makeRecord(currentAmount));
  if (futureIsTrackable) team.deadCap[nextYear].push(makeRecord(futureAmount));
  player.activeSeasons = player.activeSeasons.filter((season) => season < year);
  if (!player.activeSeasons.length) {
    team.roster = team.roster.filter(({ id }) => id !== player.id);
  }
  if (transaction === "release") {
    logTransaction(officeData, {
      type: "release",
      teams: [activeTeamId],
      player: player.name,
      details: `${player.name}${seasonEntry(player, year).position ? ` (${seasonEntry(player, year).position})` : ""} released. Dead cap: ${formatCurrency(currentAmount)} in ${year}` +
        (futureIsTrackable ? ` and ${formatCurrency(futureAmount)} in ${nextYear}.` : "."),
      auto: true
    });
  }
  renderFrontOffice();
  saveOfficeData(`${player.name} ${transaction === "trade" ? "traded" : "released"}; dead cap recorded for ${year}${futureIsTrackable ? ` and ${nextYear}` : ""}.`);
}

function selectedTeam() {
  return nflTeams.find(({ id }) => id === activeTeamId);
}

function selectedTeamData() {
  return officeData.teams[activeTeamId];
}

function updateSavingsAppearance(cell, value) {
  cell.classList.toggle("is-positive-savings", value > 0);
  cell.classList.toggle("is-negative-savings", value < 0);
}

function saveOfficeData(statusMessage) {
  if (storageIsAvailable) {
    try {
      officeData.selectedTeam = activeTeamId;
      writeStoredOffice(officeData);
    } catch (error) {
      storageIsAvailable = false;
      storageNotice.textContent = `Could not save this data in browser storage: ${error.message}. Changes are only in memory until you export a backup.`;
    }
  }
  if (statusMessage) workspaceStatus.textContent = statusMessage;
}

function textInput(value, label, field, type = "text", options = {}) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  input.dataset.field = field;
  input.setAttribute("aria-label", label);
  if (type === "number") {
    input.min = String(options.min ?? 0);
    input.max = String(options.max ?? 999999999);
    input.step = "1";
    input.inputMode = "numeric";
  } else {
    input.maxLength = options.maxLength ?? 70;
  }
  return input;
}

function currencyInput(value, label, field, allowNegative = false, signedDisplay = false) {
  const input = textInput(signedDisplay ? formatSignedCurrency(value) : formatCurrency(value), label, field, "text", { maxLength: 15 });
  input.inputMode = "decimal";
  input.dataset.currency = "true";
  input.dataset.allowNegative = String(allowNegative);
  input.dataset.signedDisplay = String(signedDisplay);
  return input;
}

function parseCurrencyInput(input) {
  const rawValue = input.value.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+$/.test(rawValue)) return null;
  const value = Number(rawValue);
  const minimum = input.dataset.allowNegative === "true" ? -999999999 : 0;
  return isIntegerInRange(value, minimum) ? value : null;
}

function deleteButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row-delete";
  button.textContent = "×";
  button.setAttribute("aria-label", label);
  return button;
}

function transactionButton(player, transaction) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row-transaction";
  button.dataset.transaction = transaction;
  button.textContent = transaction === "trade" ? "Trade" : "Release";
  button.setAttribute("aria-label", `${transaction === "trade" ? "Trade" : "Release"} ${player.name}`);
  return button;
}

function renderSeasonTabs() {
  const tabs = document.querySelector("#season-tabs");
  tabs.replaceChildren();
  const tabItems = [{ id: "depth-chart", label: "DEPTH CHART" }, ...seasons.map((year) => ({ id: String(year), label: String(year) })), {
    id: "draft-picks",
    label: "DRAFT PICKS"
  }, {
    id: "trade",
    label: "TRADE"
  }];
  for (const { id, label } of tabItems) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `season-tab-${id}`;
    tab.className = "season-tab";
    tab.setAttribute("role", "tab");
    const active = seasons.some((year) => String(year) === id)
      ? activeTab === "salary" && Number(id) === activeSeason
      : activeTab === id;
    tab.setAttribute("aria-selected", String(active));
    tab.setAttribute("aria-controls", id === "depth-chart" ? "depth-chart-panel" : id === "draft-picks" ? "draft-picks-panel" :
      id === "trade" ? "trade-panel" : "salary-year-content");
    tab.tabIndex = active ? 0 : -1;
    tab.textContent = label;
    if (id === "trade") {
      const waiting = tradesAwaitingTeam(officeData, activeTeamId).length;
      if (waiting) {
        const badge = document.createElement("span");
        badge.className = "nav-badge tab-badge";
        badge.textContent = waiting > 99 ? "99+" : String(waiting);
        badge.setAttribute("aria-label", `${waiting} pending ${waiting === 1 ? "trade needs" : "trades need"} your response`);
        badge.title = badge.getAttribute("aria-label");
        tab.append(badge);
      }
    }
    tab.addEventListener("click", () => {
      activeTab = id === "draft-picks" || id === "trade" || id === "depth-chart" ? id : "salary";
      if (activeTab === "salary") activeSeason = Number(id);
      renderFrontOffice();
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const currentIndex = tabItems.findIndex((item) => item.id === (activeTab === "salary" ? String(activeSeason) : activeTab));
      const nextTab = tabItems[(currentIndex + direction + tabItems.length) % tabItems.length];
      activeTab = seasons.some((year) => String(year) === nextTab.id) ? "salary" : nextTab.id;
      if (activeTab === "salary") activeSeason = Number(nextTab.id);
      renderFrontOffice();
      document.querySelector(`#season-tab-${nextTab.id}`).focus();
    });
    tabs.append(tab);
  }
}

function updateCapOverview() {
  document.querySelector("#salary-year-content").hidden = activeTab !== "salary";
  document.querySelector("#draft-picks-panel").hidden = activeTab !== "draft-picks";
  document.querySelector("#trade-panel").hidden = activeTab !== "trade";
  const depthPanel = document.querySelector("#depth-chart-panel");
  if (depthPanel) {
    depthPanel.hidden = activeTab !== "depth-chart";
    // The cap cards and salary tables belong to the salary-year tabs only.
    if (activeTab === "depth-chart") globalThis.renderDepthChart?.();
  }
  const team = selectedTeamData();
  const figures = seasonCapFigures(activeTeamId, activeSeason);
  document.querySelector("#dead-cap-card-total").textContent = formatCurrency(figures.deadCap);
  document.querySelector("#dead-cap-card-year").textContent = String(activeSeason);
  document.querySelector("#base-cap-value").textContent = figures.baseCap === null ? "Not set" : formatCurrency(figures.baseCap);
  document.querySelector("#cap-rollover").textContent = formatCurrency(figures.rollover);
  document.querySelector("#cap-adjustment").value = formatCurrency(team.seasons[activeSeason].manualAdjustment);
  document.querySelector("#total-cap-space").textContent = figures.totalCap === null ? "Not set" : formatCurrency(figures.totalCap);
  const room = document.querySelector("#cap-room");
  const roomCard = document.querySelector(".cap-room-stat");
  if (figures.remaining === null) {
    room.textContent = "Set base cap";
    roomCard.classList.remove("is-over", "is-under");
  } else {
    room.textContent = `${figures.remaining < 0 ? "−" : ""}${formatCurrency(Math.abs(figures.remaining))}`;
    roomCard.classList.toggle("is-over", figures.remaining < 0);
    roomCard.classList.toggle("is-under", figures.remaining > 0);
  }
  document.querySelector("#salary-season-heading").textContent = String(activeSeason);
  document.querySelector("#salary-import-season").textContent = String(activeSeason);
  document.querySelector("#salary-import-button-season").textContent = String(activeSeason);
  document.querySelector("#salary-panel-index").textContent = `${String(activeSeason - firstSeason + 1).padStart(2, "0")} / CONTRACTS`;
  document.querySelectorAll(".season-tab").forEach((tab) => {
    const active = activeTab === "salary"
      ? Number(tab.textContent) === activeSeason
      : tab.id === `season-tab-${activeTab}`;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

function normalizeSpreadsheetHeader(value) {
  return value.toLowerCase().replace(/^\uFEFF/, "").replace(/[^a-z0-9]/g, "");
}

function spreadsheetColumnMap(cells) {
  const indexes = new Map();
  const ambiguous = new Map();
  const aliases = new Map([
    ["playername", "name"], ["player", "name"], ["name", "name"],
    ["position", "position"], ["pos", "position"],
    ["rostertype", "rosterType"], ["roletype", "rosterType"],
    ["basesalary", "baseSalary"], ["proratedbonus", "proratedBonus"],
    ["rosterbonus", "rosterBonus"], ["guaranteedsalary", "guaranteedSalary"],
    ["gtdsalary", "guaranteedSalary"], ["guaranteed", "guaranteedSalary"],
    ["yearsremaining", "yearsRemaining"], ["yearsleft", "yearsRemaining"],
    ["yearleft", "yearsRemaining"], ["tradepenalty", "tradePenalty"],
    ["tradenetsavings", "tradeNetSavings"],
    ["releasepenalty", "releasePenalty"], ["releasenetsavings", "releaseNetSavings"]
  ]);
  for (const [index, cell] of cells.entries()) {
    const header = normalizeSpreadsheetHeader(cell);
    const field = aliases.get(header);
    if (field) {
      indexes.set(field, index);
    } else if (header === "penalty" || header === "netsavings") {
      const current = ambiguous.get(header) || [];
      current.push(index);
      ambiguous.set(header, current);
    }
  }
  const penalties = ambiguous.get("penalty") || [];
  const savings = ambiguous.get("netsavings") || [];
  if (penalties[0] !== undefined && !indexes.has("tradePenalty")) indexes.set("tradePenalty", penalties[0]);
  if (penalties[1] !== undefined && !indexes.has("releasePenalty")) indexes.set("releasePenalty", penalties[1]);
  if (savings[0] !== undefined && !indexes.has("tradeNetSavings")) indexes.set("tradeNetSavings", savings[0]);
  if (savings[1] !== undefined && !indexes.has("releaseNetSavings")) indexes.set("releaseNetSavings", savings[1]);
  return indexes;
}

function headerHasPlayerName(cells) {
  return cells.some((cell) => ["playername", "player", "name"].includes(normalizeSpreadsheetHeader(cell)));
}

function parsePastedAmount(value, field, lineNumber) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parenthesized = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed.replace(/[$,\s()]/g, "");
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`Row ${lineNumber}: "${value}" is not a whole-dollar amount.`);
  }
  const amount = Number(normalized) * (parenthesized ? -1 : 1);
  const minimum = field.endsWith("NetSavings") ? -999999999 : 0;
  const maximum = field === "yearsRemaining" ? 8 : 999999999;
  if (!isIntegerInRange(amount, minimum, maximum)) {
    throw new Error(`Row ${lineNumber}: "${value}" is outside the allowed range for ${field === "yearsRemaining" ? "years remaining" : "salary values"}.`);
  }
  return amount;
}

function parseSalaryPaste(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let columnMap;
  let hasHeader = false;
  let firstDataLine = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const cells = lines[index].split("\t");
    if (headerHasPlayerName(cells)) {
      columnMap = spreadsheetColumnMap(cells);
      hasHeader = true;
      firstDataLine = index + 1;
      break;
    }
  }
  const requiredColumns = ["name", "position", "rosterType", "baseSalary", "proratedBonus", "rosterBonus",
    "guaranteedSalary", "tradePenalty", "tradeNetSavings", "releasePenalty", "releaseNetSavings"];
  const missingColumns = hasHeader ? requiredColumns.filter((field) => !columnMap.has(field)) : [];
  if (missingColumns.length) {
    throw new Error(`The header row is missing: ${missingColumns.join(", ")}.`);
  }

  const importedRows = [];
  for (let index = firstDataLine; index < lines.length; index += 1) {
    const cells = lines[index].split("\t");
    if (cells.every((cell) => !cell.trim())) continue;
    const lineNumber = index + 1;
    const rowColumns = hasHeader ? columnMap : new Map([
      ["name", 0], ["position", 1], ["rosterType", 2], ["baseSalary", 3],
      ["proratedBonus", 4], ["rosterBonus", 5], ["guaranteedSalary", 6],
      ["yearsRemaining", cells.length - 5], ["tradePenalty", cells.length - 4],
      ["tradeNetSavings", cells.length - 3], ["releasePenalty", cells.length - 2],
      ["releaseNetSavings", cells.length - 1]
    ]);
    if (!hasHeader && cells.length < 12) {
      throw new Error(`Row ${lineNumber}: expected at least 12 tab-separated columns, including player details, years left, and trade/release values.`);
    }
    const name = (cells[rowColumns.get("name")] || "").trim();
    if (!name) throw new Error(`Row ${lineNumber}: player name is required.`);
    if (name.length > 70) throw new Error(`Row ${lineNumber}: player name must be 70 characters or fewer.`);
    const position = (cells[rowColumns.get("position")] || "").trim().toUpperCase();
    const rosterType = (cells[rowColumns.get("rosterType")] || "").trim();
    if (position.length > 8) throw new Error(`Row ${lineNumber}: position must be 8 characters or fewer.`);
    if (rosterType.length > 30) throw new Error(`Row ${lineNumber}: roster type must be 30 characters or fewer.`);

    const entry = emptySeasonData(position, rosterType);
    for (const field of ["baseSalary", "proratedBonus", "rosterBonus", "guaranteedSalary",
      "tradePenalty", "tradeNetSavings", "releasePenalty", "releaseNetSavings"]) {
      entry[field] = parsePastedAmount(cells[rowColumns.get(field)] || "", field, lineNumber);
    }
    importedRows.push({ name, entry, lineNumber });
  }
  if (!importedRows.length) throw new Error("No player rows found. Paste spreadsheet rows and try again.");
  if (importedRows.length > 5000) throw new Error("Paste 5,000 player rows or fewer at a time.");
  const pastedNames = new Set();
  for (const row of importedRows) {
    const key = row.name.toLocaleLowerCase();
    if (pastedNames.has(key)) throw new Error(`Row ${row.lineNumber}: "${row.name}" appears more than once in the pasted data.`);
    pastedNames.add(key);
  }
  return importedRows;
}

function importSalaryPaste() {
  let importedRows;
  try {
    importedRows = parseSalaryPaste(salaryPasteInput.value);
  } catch (error) {
    workspaceStatus.textContent = error.message;
    return;
  }

  const roster = selectedTeamData().roster;
  const stagedRoster = roster.map((player) => ({
    ...player,
    activeSeasons: [...player.activeSeasons],
    seasons: { ...player.seasons, [activeSeason]: { ...player.seasons[activeSeason] } }
  }));
  let updatedCount = 0;
  let addedCount = 0;
  for (const { name, entry } of importedRows) {
    const matches = stagedRoster.filter((player) => player.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (matches.length > 1) {
      workspaceStatus.textContent = `"${name}" matches multiple players already on this roster. Rename the duplicate before importing.`;
      return;
    }
    if (matches.length === 1) {
      matches[0].seasons[activeSeason] = entry;
      if (!isPlayerOnSeason(matches[0], activeSeason)) matches[0].activeSeasons.push(activeSeason);
      updatedCount += 1;
    } else {
      stagedRoster.push({
        id: globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        activeSeasons: [activeSeason],
        seasons: Object.fromEntries(seasons.map((year) => [year, year === activeSeason ? entry : emptySeasonData()]))
      });
      addedCount += 1;
    }
  }
  if (stagedRoster.length > 5000) {
    workspaceStatus.textContent = "This import would exceed the 5,000-player roster limit. No changes were made.";
    return;
  }

  selectedTeamData().roster = stagedRoster;
  salaryPasteInput.value = "";
  renderFrontOffice();
  salaryImportPanel.open = false;
  saveOfficeData(`Imported ${importedRows.length} ${importedRows.length === 1 ? "player" : "players"} for ${activeSeason}: ${addedCount} added, ${updatedCount} updated.`);
}

const contractFields = [
  ["baseSalary", "Base salary", false],
  ["proratedBonus", "Prorated bonus", false],
  ["rosterBonus", "Roster bonus", false],
  ["guaranteedSalary", "Guaranteed salary", false],
  ["capHit", "Cap hit", "computed"],
  ["capPercent", "Cap percentage", "computed"],
  ["yearsRemaining", "Years remaining", false],
  ["tradePenalty", "Trade penalty", false],
  ["tradeNetSavings", "Trade net savings", true],
  ["releasePenalty", "Release penalty", false],
  ["releaseNetSavings", "Release net savings", true]
];

function renderSalaryRows() {
  const roster = selectedTeamData().roster.filter((player) => isPlayerOnSeason(player, activeSeason));
  salaryRows.replaceChildren();
  salaryEmpty.hidden = roster.length > 0;
  for (const player of roster) {
    const entry = seasonEntry(player, activeSeason);
    const row = salaryRows.insertRow();
    row.dataset.playerId = player.id;
    const nameCell = row.insertCell();
    nameCell.dataset.label = "Player name";
    // The name links to the player's profile (rename the player there).
    const nameLink = document.createElement("a");
    nameLink.className = "player-name-link";
    nameLink.href = profileUrl(player.id);
    nameLink.textContent = player.name;
    nameLink.title = `Open ${player.name}'s profile`;
    nameCell.append(nameLink);
    const injury = injuryForPlayer(officeData, player, activeTeamId);
    if (injury) {
      const mark = document.createElement("a");
      mark.className = "injury-mark";
      mark.href = "injuries.html";
      mark.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><rect width="16" height="16" rx="4" fill="#e5383b"/><path d="M6.4 3.2h3.2v3.2h3.2v3.2H9.6v3.2H6.4V9.6H3.2V6.4h3.2z" fill="#fff"/></svg>';
      const summary = [injury.ir ? "Injured Reserve" : "Injured", injury.injury, injury.duration].filter(Boolean).join(" · ");
      mark.title = `On the injury report: ${summary}`;
      mark.setAttribute("aria-label", `${player.name} is on the injury report: ${summary}`);
      nameCell.append(mark);
    }
    const positionCell = row.insertCell();
    positionCell.dataset.label = "Position";
    positionCell.append(textInput(entry.position, `${player.name} position for ${activeSeason}`, "position", "text", { maxLength: 8 }));
    const rosterCell = row.insertCell();
    rosterCell.dataset.label = "Roster type";
    rosterCell.append(textInput(entry.rosterType, `${player.name} roster type for ${activeSeason}`, "rosterType", "text", { maxLength: 30 }));
    const experienceCell = row.insertCell();
    experienceCell.dataset.label = "Experience";
    experienceCell.className = "experience-cell";
    const experience = projectedExperience(player, activeSeason);
    const experienceLink = document.createElement("a");
    experienceLink.href = "contracts.html";
    experienceLink.className = "experience-value";
    experienceLink.textContent = experience === null ? "—" : String(experience);
    experienceLink.title = activeSeason === currentLeagueYear()
      ? "Entered on the Player Contracts page. Click to edit there"
      : `Projected for ${activeSeason} from the Player Contracts value. Click to edit there`;
    experienceCell.append(experienceLink);
    for (const [field, label, signed] of contractFields) {
      const cell = row.insertCell();
      cell.dataset.label = label;
      if (signed === "computed") {
        cell.className = "computed-cell";
        cell.dataset.computed = field;
        continue;
      }
      if (field === "yearsRemaining") cell.className = "years-cell";
      const ariaLabel = `${player.name} ${label} for ${activeSeason}`;
      if (field === "yearsRemaining") {
        const input = textInput(yearsRemainingFor(player, activeSeason), ariaLabel, field, "number", { max: 8 });
        input.readOnly = true;
        input.title = "Count of this and future seasons with a base salary above $0.";
        cell.append(input);
      } else {
        const signedDisplay = field === "tradeNetSavings" || field === "releaseNetSavings";
        const penalties = calculatedPenaltiesFor(player, activeSeason);
        const isCalculatedPenalty = penalties && (field === "tradePenalty" || field === "releasePenalty");
        const value = isCalculatedPenalty ? penalties[field] : entry[field];
        const input = currencyInput(value, ariaLabel, field, signed === true, signedDisplay);
        if (isCalculatedPenalty) {
          input.readOnly = true;
          input.title = "Calculated from prorated bonuses and guaranteed salary using the current league-year rules.";
        }
        cell.append(input);
        if (signedDisplay) updateSavingsAppearance(cell, entry[field]);
      }
    }
    const actionCell = row.insertCell();
    actionCell.dataset.label = "Actions";
    const actions = document.createElement("div");
    actions.className = "salary-row-actions";
    if (activeSeason === currentLeagueYear()) {
      actions.append(transactionButton(player, "release"));
    }
    actions.append(deleteButton(`Remove ${player.name} from the ${activeSeason} salary sheet`));
    actionCell.append(actions);
  }
  updateComputedCells();
}

function updateComputedCells() {
  const { totalCap } = seasonCapFigures(activeTeamId, activeSeason);
  for (const row of salaryRows.rows) {
    const player = selectedTeamData().roster.find(({ id }) => id === row.dataset.playerId);
    if (!player) continue;
    const entry = seasonEntry(player, activeSeason);
    const capHit = capHitFor(entry);
    row.querySelector('[data-computed="capHit"]').textContent = formatCurrency(capHit);
    row.querySelector('[data-computed="capPercent"]').textContent = totalCap > 0
      ? `${((capHit / totalCap) * 100).toFixed(2)}%`
      : "—";
    row.querySelector('[data-field="yearsRemaining"]').value = String(yearsRemainingFor(player, activeSeason));
    const penalties = calculatedPenaltiesFor(player, activeSeason);
    for (const field of ["tradePenalty", "releasePenalty"]) {
      const input = row.querySelector(`[data-field="${field}"]`);
      input.value = formatCurrency(penalties ? penalties[field] : entry[field]);
      input.readOnly = Boolean(penalties);
    }
  }
}

function makeTeamSelect(selectedId, ariaLabel) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", ariaLabel);
  for (const { id, name } of nflTeams) select.add(new Option(name, id));
  select.value = selectedId;
  return select;
}

// Read-only: picks are created and edited on Admin › Draft Pick Manager.
function renderPickRows() {
  const ownedPicks = officeData.picks
    .filter((pick) => pick.currentOwner === activeTeamId)
    .sort(comparePicks);
  document.querySelector("#owned-pick-count").textContent = String(ownedPicks.length);
  picksRows.replaceChildren();
  document.querySelector("#picks-empty").hidden = ownedPicks.length > 0;
  for (const pick of ownedPicks) {
    const row = picksRows.insertRow();
    row.dataset.pickId = pick.id;
    row.insertCell().textContent = String(pick.year);
    row.insertCell().textContent = `${teamName(pick.currentOwner)} (${pick.currentOwner})`;
    const roundCell = row.insertCell();
    roundCell.textContent = `Round ${pickRoundLabel(pick)}`;
    if (pick.compensatory) roundCell.title = "Compensatory pick (bottom of the round)";
    const originalCell = row.insertCell();
    originalCell.textContent = `${teamName(pick.originalTeam)} (${pick.originalTeam})`;
    if (pick.originalTeam === activeTeamId) originalCell.className = "pick-own";
    row.insertCell().textContent = pick.note || "—";
  }
}

function tradeParticipants() {
    return [activeTeamId, ...tradePartnerIds.filter((id) => nflTeams.some((team) => team.id === id) && id !== activeTeamId)]
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .slice(0, 3);
  }

function readTradeLines() {
    for (const section of document.querySelectorAll(".trade-team-section")) {
      tradeLines[section.dataset.teamId] = [...section.querySelectorAll(".trade-asset-row")].map((row) => ({
        id: row.dataset.lineId,
        assetKey: row.querySelector("[data-trade-asset]").value,
        destinationId: row.querySelector("[data-trade-destination]").value
      }));
    }
  }

function tradeSelect(options, label, dataAttribute) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", label);
    select.dataset[dataAttribute] = "true";
    for (const [value, text] of options) select.add(new Option(text, value));
    return select;
  }

function renderTradePanel() {
    const participants = tradeParticipants();
    const partnerSelects = [
      document.querySelector("#trade-partner-one"),
      document.querySelector("#trade-partner-two")
    ];
    for (const [index, select] of partnerSelects.entries()) {
      const selected = tradePartnerIds[index];
      select.replaceChildren(new Option(index === 0 ? "Choose a team" : "No second partner", ""));
      for (const team of nflTeams) {
        if (team.id === activeTeamId) continue;
        const option = new Option(`${team.name} (${team.id})`, team.id);
        if ((index === 0 && team.id === tradePartnerIds[1]) ||
            (index === 1 && team.id === tradePartnerIds[0])) option.disabled = true;
        select.add(option);
      }
      select.value = selected;
    }

    const sections = document.querySelector("#trade-team-sections");
    sections.replaceChildren();
    const year = currentLeagueYear();
    for (const teamId of participants) {
      const team = nflTeams.find(({ id }) => id === teamId);
      const section = document.createElement("section");
      section.className = "trade-team-section";
      section.dataset.teamId = teamId;
      const heading = document.createElement("div");
      heading.className = "trade-team-heading";
      const title = document.createElement("h4");
      title.textContent = `${team.name} (${team.id}) sends`;
      const helper = document.createElement("span");
      helper.textContent = "Players and picks owned by this team";
      heading.append(title, helper);
      section.append(heading);

      const lines = tradeLines[teamId] || [];
      for (const line of lines) {
        const row = document.createElement("div");
        row.className = "trade-asset-row";
        row.dataset.lineId = line.id;
        const availableAssets = [
          ...officeData.teams[teamId].roster
            .filter((player) => isPlayerOnSeason(player, year))
            .map((player) => [`player:${player.id}`, tradeAssetLabel(officeData, `player:${player.id}`, teamId, year)]),
          ...officeData.picks
            .filter((pick) => pick.currentOwner === teamId)
            .sort(comparePicks)
            .map((pick) => [`pick:${pick.id}`, tradeAssetLabel(officeData, `pick:${pick.id}`, teamId, year)])
        ].filter(([, label]) => label);
        const assetOptions = [["", "Choose a player or draft pick"], ...availableAssets];
        const assetSelect = tradeSelect(assetOptions, `Asset sent by ${team.name}`, "tradeAsset");
        assetSelect.value = line.assetKey;
        if (line.assetKey && !assetOptions.some(([value]) => value === line.assetKey)) assetSelect.value = "";
        const destinationOptions = participants.filter((id) => id !== teamId)
          .map((id) => [id, `${nflTeams.find(({ id: teamIdForName }) => teamIdForName === id).name} (${id})`]);
        const destinationSelect = tradeSelect(destinationOptions, `Destination for asset from ${team.name}`, "tradeDestination");
        destinationSelect.value = line.destinationId;
        if (!destinationOptions.some(([value]) => value === line.destinationId)) {
          destinationSelect.value = destinationOptions[0]?.[0] || "";
        }
        const remove = deleteButton(`Remove trade asset from ${team.name}`);
        row.append(assetSelect, destinationSelect, remove);
        section.append(row);
      }
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "workspace-button trade-add-asset";
      addButton.dataset.teamId = teamId;
      addButton.textContent = "＋ Add asset";
      section.append(addButton);
      sections.append(section);
    }
    document.querySelector("#trade-empty").hidden = participants.length > 1;
    updateTradeSummary();
  }

function tradeAssetEntries() {
    return Object.entries(tradeLines).flatMap(([fromTeamId, lines]) =>
      lines.map((line) => ({ ...line, fromTeamId }))
    );
  }

function updateTradeSummary() {
    const impactContainer = document.querySelector("#trade-impact");
    impactContainer.replaceChildren();
    const participants = tradeParticipants();
    const lines = tradeAssetEntries();
    const validLines = lines.filter((line) => line.assetKey && line.destinationId);
    const impacts = calculateTradeImpacts(officeData, validLines, participants);
    const year = currentLeagueYear();
    const heading = document.createElement("h4");
    heading.textContent = `${year} cap-space impact`;
    impactContainer.append(heading);
    for (const teamId of participants) {
      const team = nflTeams.find(({ id }) => id === teamId);
      const impact = impacts[teamId];
      const card = document.createElement("article");
      card.className = "trade-impact-card";
      const title = document.createElement("h5");
      title.textContent = `${team.name} (${team.id})`;
      const details = document.createElement("dl");
      for (const [label, value] of [
        ["Incoming cap (reduces room)", -impact.incoming],
        ["Outgoing cap (frees room)", impact.outgoing],
        ["Trade dead cap", -impact.deadCap],
        ["Net cap-space change", impact.net]
      ]) {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        term.textContent = label;
        const amount = document.createElement("dd");
        amount.textContent = formatSignedCurrency(value);
        if (label === "Net cap-space change") amount.className = value > 0 ? "is-positive-savings" : value < 0 ? "is-negative-savings" : "";
        row.append(term, amount);
        details.append(row);
      }
      const remaining = document.createElement("p");
      remaining.className = "trade-projected-room";
      remaining.textContent = impact.remaining === null
        ? "Projected cap room: base cap not set"
        : `Projected cap room: ${formatSignedCurrency(impact.remaining + impact.net)}`;
      if (impact.remaining !== null && impact.remaining + impact.net < 0) remaining.classList.add("is-negative-room");
      if (impact.remaining !== null && impact.remaining + impact.net > 0) remaining.classList.add("is-positive-room");
      card.append(title, details, remaining);
      impactContainer.append(card);
    }
    const duplicateAsset = new Set();
    let hasDuplicate = false;
    for (const line of validLines) {
      const key = `${line.fromTeamId}:${line.assetKey}`;
      if (duplicateAsset.has(key)) hasDuplicate = true;
      duplicateAsset.add(key);
    }
    const execute = document.querySelector("#propose-trade");
    const validation = document.querySelector("#trade-validation");
    const invalid = validLines.length !== lines.length;
    execute.disabled = participants.length < 2 || !validLines.length || invalid || hasDuplicate || lines.length > 100;
    validation.textContent = participants.length < 2
      ? "Choose at least one partner team to start a trade."
      : lines.length > 100
        ? "A trade can include up to 100 assets."
        : hasDuplicate
          ? "Each player or draft pick can only appear once in a trade."
          : invalid
            ? "Choose an asset and destination for every trade row."
            : "";
}

function renderDeadCapRows() {
  const year = activeSeason;
  // Only the first two salary sheets have a dead-cap table; later years show none.
  const tracked = deadCapSeasons.includes(year);
  document.querySelector("#dead-cap-panel").hidden = !tracked;
  document.querySelector("#dead-cap-card").hidden = !tracked;
  const records = deadCapSeasons.includes(year) ? selectedTeamData().deadCap[year] : [];
  const body = deadCapRows;
  body.replaceChildren();
  const emptyMessage = document.querySelector("#dead-cap-empty");
  emptyMessage.textContent = deadCapSeasons.includes(year)
    ? `No trade or release dead cap recorded for ${year}.`
    : `Dead-cap tracking is available for the ${deadCapSeasons.join(" and ")} salary tables.`;
  emptyMessage.hidden = records.length > 0;
  document.querySelector("#dead-cap-ledger-year").textContent = String(year);
  document.querySelector("#dead-cap-ledger-year-button").textContent = String(year);
  for (const record of records) {
    const row = body.insertRow();
    row.dataset.deadCapId = record.id;
    const typeCell = row.insertCell();
    typeCell.textContent = record.transaction === "trade" ? "Trade" : record.transaction === "release" ? "Release" : "Import";
    const playerCell = row.insertCell();
    playerCell.textContent = record.playerName;
    const positionCell = row.insertCell();
    positionCell.textContent = record.position || "—";
    const sourceCell = row.insertCell();
    sourceCell.textContent = String(record.transactionYear);
    const amountCell = row.insertCell();
    amountCell.className = "dead-cap-amount";
    amountCell.textContent = formatCurrency(record.amount);
    const dateCell = row.insertCell();
    dateCell.textContent = new Date(record.date).toLocaleDateString();
    const actionCell = row.insertCell();
    actionCell.append(deleteButton(`Remove ${record.playerName}'s ${year} dead-cap record`));
  }
}

function importDeadCapPaste() {
  if (!deadCapSeasons.includes(activeSeason)) {
    workspaceStatus.textContent = `Dead-cap imports are available only for ${deadCapSeasons.join(" and ")}. Select one of those salary tabs first.`;
    return;
  }
  const lines = deadCapPasteInput.value.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    workspaceStatus.textContent = "Paste Player Name, Position, and Cap Hit rows before importing.";
    return;
  }
  const normalize = (value) => value.toLowerCase().replace(/^\uFEFF/, "").replace(/[^a-z0-9]/g, "");
  const firstCells = lines[0].split("\t");
  const headers = firstCells.map(normalize);
  const hasHeader = ["playername", "player", "name"].includes(headers[0]) &&
    ["position", "pos"].includes(headers[1]) && ["caphit", "deadcap"].includes(headers[2]);
  const columns = hasHeader ? {
    name: headers.findIndex((header) => ["playername", "player", "name"].includes(header)),
    position: headers.findIndex((header) => ["position", "pos"].includes(header)),
    amount: headers.findIndex((header) => ["caphit", "deadcap"].includes(header))
  } : { name: 0, position: 1, amount: 2 };
  const rows = [];
  const names = new Set();
  for (let index = hasHeader ? 1 : 0; index < lines.length; index += 1) {
    const cells = lines[index].split("\t");
    const lineNumber = index + 1;
    const playerName = (cells[columns.name] || "").trim();
    const position = (cells[columns.position] || "").trim().toUpperCase();
    if (!playerName || playerName.length > 70) {
      workspaceStatus.textContent = `Row ${lineNumber}: enter a player name up to 70 characters. No changes were made.`;
      return;
    }
    if (position.length > 8) {
      workspaceStatus.textContent = `Row ${lineNumber}: position must be 8 characters or fewer. No changes were made.`;
      return;
    }
    let amount;
    try {
      amount = parsePastedAmount(cells[columns.amount] || "", "baseSalary", lineNumber);
    } catch (error) {
      workspaceStatus.textContent = `${error.message} No changes were made.`;
      return;
    }
    const key = playerName.toLocaleLowerCase();
    if (names.has(key)) {
      workspaceStatus.textContent = `Row ${lineNumber}: "${playerName}" appears more than once in the pasted data. No changes were made.`;
      return;
    }
    names.add(key);
    rows.push({ playerName, position, amount });
  }
  if (!rows.length) {
    workspaceStatus.textContent = "No dead-cap rows found. Paste data and try again.";
    return;
  }
  const ledger = selectedTeamData().deadCap[activeSeason];
  if (ledger.length + rows.length > 5000) {
    workspaceStatus.textContent = "This import would exceed the 5,000-entry dead-cap limit. No changes were made.";
    return;
  }
  const date = new Date().toISOString();
  for (const row of rows) {
    ledger.push({
      id: globalThis.crypto?.randomUUID?.() || `dead-cap-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      playerName: row.playerName,
      position: row.position,
      transaction: "import",
      transactionYear: activeSeason,
      amount: row.amount,
      date
    });
  }
  deadCapPasteInput.value = "";
  renderFrontOffice();
  saveOfficeData(`Imported ${rows.length} dead-cap ${rows.length === 1 ? "row" : "rows"} for ${activeSeason}.`);
}

function renderFrontOffice() {
  renderSeasonTabs();
  renderSalaryRows();
  renderDeadCapRows();
  renderPickRows();
  updateCapOverview();
  renderTradePanel();
  renderTradeOffers();
}

function addTradeAssetRow(teamId) {
  readTradeLines();
  const participants = tradeParticipants();
  const destinationId = participants.find((id) => id !== teamId) || "";
  tradeLines[teamId] ||= [];
  tradeLines[teamId].push({
    id: `trade-line-${++tradeLineCounter}`,
    assetKey: "",
    destinationId
  });
  renderTradePanel();
  document.querySelector(`#trade-team-sections [data-team-id="${teamId}"] .trade-asset-row:last-of-type [data-trade-asset]`)?.focus();
}

function proposeTrade() {
  readTradeLines();
  const participants = tradeParticipants();
  const lines = tradeAssetEntries().map(({ fromTeamId, destinationId, assetKey }) => ({ fromTeamId, destinationId, assetKey }));
  const check = validateTradeAssets(officeData, lines, participants);
  if (check.error) {
    workspaceStatus.textContent = `${check.error} The trade was not proposed.`;
    return;
  }
  if (officeData.pendingTrades.length >= 2000) {
    workspaceStatus.textContent = "The trade log has reached its 2,000-trade limit. The trade was not proposed.";
    return;
  }
  officeData.pendingTrades.push({
    id: newRecordId("trade"),
    status: "awaiting-teams",
    proposedBy: activeTeamId,
    participants,
    acceptedBy: [activeTeamId],
    lines,
    createdAt: new Date().toISOString()
  });
  const partners = participants.filter((id) => id !== activeTeamId).map(teamName).join(" and ");
  tradeLines = {};
  tradePartnerIds = ["", ""];
  renderFrontOffice();
  saveOfficeData(`Trade proposed to ${partners}. Once every team accepts, it goes to the commissioner for approval.`);
}

function respondToTrade(tradeId, action) {
  const trade = officeData.pendingTrades.find(({ id }) => id === tradeId);
  if (!trade || !trade.participants.includes(activeTeamId)) return;
  const now = new Date().toISOString();
  if (action === "accept") {
    if (trade.status !== "awaiting-teams" || trade.acceptedBy.includes(activeTeamId)) return;
    const check = validateTradeAssets(officeData, trade.lines, trade.participants);
    if (check.error) {
      workspaceStatus.textContent = `${check.error} This trade can no longer be accepted; decline it instead.`;
      return;
    }
    trade.acceptedBy.push(activeTeamId);
    if (trade.participants.every((id) => trade.acceptedBy.includes(id))) trade.status = "awaiting-admin";
    renderFrontOffice();
    saveOfficeData(trade.status === "awaiting-admin"
      ? "Trade accepted. All teams have agreed, so it is now waiting for commissioner approval."
      : "Trade accepted. Waiting on the other partner team.");
  } else if (action === "decline") {
    if (trade.status !== "awaiting-teams" || trade.acceptedBy.includes(activeTeamId)) return;
    Object.assign(trade, { status: "declined", resolvedAt: now, note: `Declined by ${teamName(activeTeamId)}.` });
    renderFrontOffice();
    saveOfficeData("Trade declined.");
  } else if (action === "withdraw") {
    if (trade.proposedBy !== activeTeamId || !["awaiting-teams", "awaiting-admin"].includes(trade.status)) return;
    Object.assign(trade, { status: "withdrawn", resolvedAt: now, note: `Withdrawn by ${teamName(activeTeamId)}.` });
    renderFrontOffice();
    saveOfficeData("Trade proposal withdrawn.");
  }
}

function renderTradeOffers() {
  const container = document.querySelector("#trade-offers");
  container.replaceChildren();
  const isOpen = (trade) => ["awaiting-teams", "awaiting-admin"].includes(trade.status);
  const needsMe = (trade) => trade.status === "awaiting-teams" && !trade.acceptedBy.includes(activeTeamId);
  const mine = officeData.pendingTrades.filter((trade) => trade.participants.includes(activeTeamId));
  const open = mine.filter(isOpen)
    .sort((a, b) => Number(needsMe(b)) - Number(needsMe(a)) || b.createdAt.localeCompare(a.createdAt));
  const recent = mine.filter((trade) => !isOpen(trade))
    .sort((a, b) => (b.resolvedAt || b.createdAt).localeCompare(a.resolvedAt || a.createdAt)).slice(0, 5);
  const heading = document.createElement("h4");
  heading.className = "trade-offers-heading";
  heading.textContent = "Pending trades";
  container.append(heading);
  if (!open.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No pending trades involve this team.";
    container.append(empty);
  }
  for (const trade of open) {
    const card = buildTradeCard(officeData, trade);
    const actions = card.querySelector(".trade-offer-actions");
    if (needsMe(trade)) {
      actions.append(tradeActionButton("Accept trade", "accept", true), tradeActionButton("Decline", "decline"));
    }
    if (trade.proposedBy === activeTeamId) actions.append(tradeActionButton("Withdraw proposal", "withdraw"));
    container.append(card);
  }
  if (recent.length) {
    const recentHeading = document.createElement("h4");
    recentHeading.className = "trade-offers-heading";
    recentHeading.textContent = "Recent trade decisions";
    container.append(recentHeading);
    for (const trade of recent) container.append(buildTradeCard(officeData, trade));
  }
}

document.querySelector("#trade-partner-one").addEventListener("change", (event) => {
  readTradeLines();
  tradePartnerIds[0] = event.currentTarget.value;
  if (tradePartnerIds[0] && tradePartnerIds[0] === tradePartnerIds[1]) tradePartnerIds[1] = "";
  const activeParticipants = tradeParticipants();
  tradeLines = Object.fromEntries(Object.entries(tradeLines).filter(([teamId]) => activeParticipants.includes(teamId)));
  renderTradePanel();
});

document.querySelector("#trade-partner-two").addEventListener("change", (event) => {
  readTradeLines();
  tradePartnerIds[1] = event.currentTarget.value;
  if (tradePartnerIds[1] && tradePartnerIds[1] === tradePartnerIds[0]) tradePartnerIds[1] = "";
  const activeParticipants = tradeParticipants();
  tradeLines = Object.fromEntries(Object.entries(tradeLines).filter(([teamId]) => activeParticipants.includes(teamId)));
  renderTradePanel();
});

document.querySelector("#trade-team-sections").addEventListener("change", (event) => {
  if (!event.target.matches("[data-trade-asset], [data-trade-destination]")) return;
  readTradeLines();
  updateTradeSummary();
});

document.querySelector("#trade-team-sections").addEventListener("click", (event) => {
  const addButton = event.target.closest(".trade-add-asset");
  if (addButton) {
    addTradeAssetRow(addButton.dataset.teamId);
    return;
  }
  const removeButton = event.target.closest(".row-delete");
  const row = removeButton?.closest(".trade-asset-row");
  if (!row) return;
  readTradeLines();
  const section = row.closest(".trade-team-section");
  tradeLines[section.dataset.teamId] = tradeLines[section.dataset.teamId]
    .filter((line) => line.id !== row.dataset.lineId);
  renderTradePanel();
});

document.querySelector("#propose-trade").addEventListener("click", proposeTrade);

document.querySelector("#trade-offers").addEventListener("click", (event) => {
  const button = event.target.closest("[data-trade-action]");
  const card = button?.closest("[data-trade-id]");
  if (card) respondToTrade(card.dataset.tradeId, button.dataset.tradeAction);
});

document.querySelector("#import-dead-cap-paste").addEventListener("click", importDeadCapPaste);

deadCapRows.addEventListener("click", (event) => {
  const button = event.target.closest(".row-delete");
  const row = button?.closest("[data-dead-cap-id]");
  if (!row || !deadCapSeasons.includes(activeSeason)) return;
  const ledger = selectedTeamData().deadCap[activeSeason];
  const recordIndex = ledger.findIndex(({ id }) => id === row.dataset.deadCapId);
  if (recordIndex === -1) return;
  const [removedRecord] = ledger.splice(recordIndex, 1);
  renderFrontOffice();
  saveOfficeData(`${removedRecord.playerName}'s ${activeSeason} dead-cap record removed.`);
});

try {
  const savedData = localStorage.getItem(officeStorageKey);
  if (savedData) {
    officeData = loadStoredOfficeData(JSON.parse(savedData));
    officeData.selectedTeam = activeTeamId;
    localStorage.setItem(officeStorageKey, JSON.stringify(officeData));
  }
} catch (error) {
  storageIsAvailable = false;
  storageNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. Your current browser data has not been overwritten; import a backup or reset local data to start fresh."
    : `${error.message || "Browser storage is unavailable."} Changes will not persist after you close this page.`;
}

const currentTeam = selectedTeam();
document.title = `${currentTeam.name} Salary Sheet — Nothing But NFL`;
document.querySelector("#team-page-name").textContent = currentTeam.name;
{
  const managers = teamManagers(officeData, currentTeam.id);
  const subtitle = document.querySelector("#team-page-subtitle");
  subtitle.textContent = `${currentTeam.id} franchise salary sheet and draft-pick ledger.`;
  if (managers.length) {
    const gm = document.createElement("a");
    gm.className = "team-gm-link";
    gm.href = "members.html";
    gm.textContent = `${managers.length > 1 ? "GMs" : "GM"}: ${managers.map((m) => m.name).join(" & ")}`;
    subtitle.append(" ", gm);
  }
}
document.querySelector("#team-heading-name").textContent = currentTeam.name;
document.querySelector("#selected-team-name").textContent = `${currentTeam.name} (${currentTeam.id})`;
const teamLogo = document.querySelector("#team-page-logo");
teamLogo.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${currentTeam.logo}.png`;
teamLogo.alt = `${currentTeam.name} logo`;
teamLogo.addEventListener("error", () => {
  teamLogo.hidden = true;
  const fallback = document.querySelector("#team-page-fallback");
  fallback.textContent = currentTeam.id;
  fallback.hidden = false;
}, { once: true });

document.querySelector("#cap-adjustment").addEventListener("change", (event) => {
  const input = event.currentTarget;
  const value = parseCurrencyInput(input);
  if (value === null) {
    input.setCustomValidity("Enter a whole dollar amount, such as $1,000,000 or -$1,000,000.");
    input.reportValidity();
    input.setCustomValidity("");
    input.value = formatCurrency(selectedTeamData().seasons[activeSeason].manualAdjustment);
    return;
  }
  selectedTeamData().seasons[activeSeason].manualAdjustment = value;
  input.value = formatCurrency(value);
  updateCapOverview();
  updateComputedCells();
  updateTradeSummary();
  saveOfficeData(`${currentTeam.name} ${activeSeason} manual cap adjustment updated.`);
});

document.querySelector("#add-player-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const player = {
    id: globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: values.get("name").trim(),
    activeSeasons: [activeSeason],
    seasons: Object.fromEntries(seasons.map((year) => [year, year === activeSeason
      ? emptySeasonData(values.get("position").trim().toUpperCase(), values.get("rosterType").trim())
      : emptySeasonData()]))
  };
  if (!player.name || !values.get("position").trim() || !values.get("rosterType").trim()) return;
  selectedTeamData().roster.push(player);
  form.reset();
  renderFrontOffice();
  saveOfficeData(`${player.name} added to the ${currentTeam.name} roster.`);
});

document.querySelector("#import-salary-paste").addEventListener("click", importSalaryPaste);

salaryRows.addEventListener("change", (event) => {
  const input = event.target.closest("[data-field]");
  const row = input?.closest("[data-player-id]");
  if (!input || !row) return;
  const player = selectedTeamData().roster.find(({ id }) => id === row.dataset.playerId);
  if (!player) return;
  const field = input.dataset.field;
  if (field === "yearsRemaining" ||
      (calculatedPenaltiesFor(player, activeSeason) && (field === "tradePenalty" || field === "releasePenalty"))) return;
  if (field === "name" || field === "position" || field === "rosterType") {
    const value = input.value.trim();
    const maxLength = field === "name" ? 70 : field === "position" ? 8 : 30;
    if (!value || value.length > maxLength) {
      input.reportValidity();
      renderSalaryRows();
      return;
    }
    if (field === "name") player.name = value;
    else seasonEntry(player, activeSeason)[field] = field === "position" ? value.toUpperCase() : value;
  } else {
    const min = field.endsWith("NetSavings") ? -999999999 : 0;
    const value = input.dataset.currency === "true" ? parseCurrencyInput(input) : input.valueAsNumber;
    if (value === null || !input.validity.valid ||
        !isIntegerInRange(value, min, field === "yearsRemaining" ? 8 : 999999999)) {
      input.setCustomValidity(input.dataset.currency === "true"
        ? "Enter a whole dollar amount, such as $1,000,000."
        : "");
      input.reportValidity();
      input.setCustomValidity("");
      renderSalaryRows();
      return;
    }
    seasonEntry(player, activeSeason)[field] = value;
    if (input.dataset.currency === "true") {
      input.value = input.dataset.signedDisplay === "true" ? formatSignedCurrency(value) : formatCurrency(value);
    }
    if (field === "tradeNetSavings" || field === "releaseNetSavings") {
      updateSavingsAppearance(input.closest("td"), value);
    }
  }
  updateCapOverview();
  updateComputedCells();
  updateTradeSummary();
  saveOfficeData(`${player.name}'s ${field} updated for ${activeSeason}.`);
});

salaryRows.addEventListener("focusin", (event) => {
  const input = event.target.closest("[data-currency='true']");
  if (input) input.value = input.value.replace(/[$,\s]/g, "");
});

salaryRows.addEventListener("focusout", (event) => {
  const input = event.target.closest("[data-currency='true']");
  const value = input && parseCurrencyInput(input);
  if (input && value !== null) {
    input.value = input.dataset.signedDisplay === "true" ? formatSignedCurrency(value) : formatCurrency(value);
  }
});

document.querySelector("#cap-adjustment").addEventListener("focus", (event) => {
  event.currentTarget.value = event.currentTarget.value.replace(/[$,\s]/g, "");
});

document.querySelector("#cap-adjustment").addEventListener("blur", (event) => {
  const input = event.currentTarget;
  const value = parseCurrencyInput(input);
  if (value !== null) input.value = formatCurrency(value);
});

salaryRows.addEventListener("click", (event) => {
  const transactionButton = event.target.closest("[data-transaction]");
  const row = transactionButton?.closest("[data-player-id]");
  if (transactionButton && row) {
    const player = selectedTeamData().roster.find(({ id }) => id === row.dataset.playerId);
    if (player) recordRosterTransaction(player, transactionButton.dataset.transaction);
    return;
  }
  const button = event.target.closest(".row-delete");
  const deleteRow = button?.closest("[data-player-id]");
  if (!deleteRow) return;
  const roster = selectedTeamData().roster;
  const removedPlayer = roster.find(({ id }) => id === deleteRow.dataset.playerId);
  if (removedPlayer) {
    removedPlayer.activeSeasons = removedPlayer.activeSeasons.filter((year) => year !== activeSeason);
    if (!removedPlayer.activeSeasons.length) {
      selectedTeamData().roster = roster.filter(({ id }) => id !== deleteRow.dataset.playerId);
    }
  }
  renderFrontOffice();
  saveOfficeData(`${removedPlayer?.name || "Player"} removed from the ${activeSeason} salary sheet.`);
});

document.querySelector("#export-data").addEventListener("click", () => {
  const backup = {
    ...officeData,
    selectedTeam: activeTeamId,
    exportedAt: new Date().toISOString()
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `nothing-but-football-front-office-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  workspaceStatus.textContent = "Front-office backup exported as JSON.";
});

document.querySelector("#import-data").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    officeData = loadStoredOfficeData(JSON.parse(await file.text()));
    officeData.selectedTeam = activeTeamId;
    storageIsAvailable = true;
    storageNotice.textContent = "Edits are saved in this browser only. This workspace has no league sync or live NFL data.";
    renderFrontOffice();
    saveOfficeData(`Imported backup with ${officeData.picks.length} picks and ${nflTeams.reduce((sum, { id }) => sum + officeData.teams[id].roster.length, 0)} players.`);
  } catch (error) {
    workspaceStatus.textContent = error instanceof SyntaxError
      ? "Could not read that file as JSON. No changes were made."
      : error.message;
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#reset-data").addEventListener("click", async () => {
  if (!await confirmAction("Reset all locally saved contracts, league-wide cap settings, and draft picks for all NFL teams? Export a backup first if you want to keep them.", { confirmLabel: "Reset all data", danger: true })) return;
  try {
    localStorage.removeItem(officeStorageKey);
    storageIsAvailable = true;
    storageNotice.textContent = "Edits are saved in this browser only. This workspace has no league sync or live NFL data.";
    officeData = emptyOfficeData(activeTeamId);
    renderFrontOffice();
    saveOfficeData("Local front-office data reset. All team ledgers are blank.");
  } catch (error) {
    storageIsAvailable = false;
    storageNotice.textContent = `Could not reset browser storage: ${error.message}.`;
  }
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  if (event.newValue === null) {
    officeData = emptyOfficeData(activeTeamId);
    renderFrontOffice();
    workspaceStatus.textContent = "Local front-office data was reset in another tab.";
    return;
  }
  try {
    officeData = loadStoredOfficeData(JSON.parse(event.newValue));
    renderFrontOffice();
    workspaceStatus.textContent = "Front-office updates synced from another tab.";
  } catch (error) {
    workspaceStatus.textContent = `Could not sync changes from another tab: ${error.message}`;
  }
});

renderFrontOffice();
