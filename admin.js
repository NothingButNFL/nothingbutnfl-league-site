// League Cap Directory. Data model, validation and migrations live in league-core.js.
const adminCapRows = document.querySelector("#admin-cap-rows");
const adminStorageNotice = document.querySelector("#admin-storage-notice");
const adminStatus = document.querySelector("#admin-status");

function renderAdminCaps(data) {
  adminCapRows.replaceChildren();
  for (const year of seasons) {
    const row = adminCapRows.insertRow();
    row.insertCell().textContent = String(year);
    const capCell = row.insertCell();
    capCell.className = "admin-cap-cell";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 12;
    input.inputMode = "decimal";
    input.value = data.leagueCaps[year] === null ? "" : formatCurrency(data.leagueCaps[year]);
    input.placeholder = "Set base cap";
    input.dataset.year = String(year);
    input.dataset.currency = "true";
    input.setAttribute("aria-label", `${year} league-wide base salary cap in dollars`);
    capCell.append(input);
  }
}

function parseAdminCurrency(input) {
  const rawValue = input.value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(rawValue)) return null;
  const value = Number(rawValue);
  return isIntegerInRange(value) ? value : null;
}

let officeData = emptyOfficeData();
let safeToSave = true;
let storageAvailable = true;
try {
  const saved = localStorage.getItem(officeStorageKey);
  if (saved) {
    const parsed = JSON.parse(saved);
    officeData = loadStoredOfficeData(parsed);
    if (parsed.version !== officeData.version) writeStoredOffice(officeData);
  }
} catch (error) {
  storageAvailable = false;
  safeToSave = false;
  adminStorageNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; correct the saved data or restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}

renderAdminCaps(officeData);
if (!safeToSave) {
  adminCapRows.querySelectorAll("input").forEach((input) => { input.disabled = true; });
}

adminCapRows.addEventListener("change", (event) => {
  const input = event.target.closest("[data-year]");
  if (!input) return;
  const year = Number(input.dataset.year);
  const value = input.value.trim() ? parseAdminCurrency(input) : null;
  if (input.value.trim() && (value === null || !input.validity.valid)) {
    input.setCustomValidity("Enter a whole dollar amount, such as $1,000,000.");
    input.reportValidity();
    input.setCustomValidity("");
    input.value = officeData.leagueCaps[year] === null ? "" : formatCurrency(officeData.leagueCaps[year]);
    return;
  }

  const updatedData = { ...officeData, leagueCaps: { ...officeData.leagueCaps, [year]: value } };
  if (storageAvailable) {
    try {
      writeStoredOffice(updatedData);
    } catch (error) {
      storageAvailable = false;
      adminStorageNotice.textContent = `Could not save this data in browser storage: ${error.message}. Changes are only in memory until storage is available.`;
      input.value = officeData.leagueCaps[year] === null ? "" : formatCurrency(officeData.leagueCaps[year]);
      return;
    }
  }
  officeData = updatedData;
  input.value = value === null ? "" : formatCurrency(value);
  adminStatus.textContent = `${year} league-wide base salary cap ${value === null ? "cleared" : "updated"}.`;
});

adminCapRows.addEventListener("focusin", (event) => {
  const input = event.target.closest("[data-currency='true']");
  if (input) input.value = input.value.replace(/[$,\s]/g, "");
});

adminCapRows.addEventListener("focusout", (event) => {
  const input = event.target.closest("[data-currency='true']");
  const value = input && parseAdminCurrency(input);
  if (input && value !== null) input.value = formatCurrency(value);
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    renderAdminCaps(officeData);
    adminStatus.textContent = "Front-office updates synced from another tab.";
  } catch (error) {
    adminStatus.textContent = `${error.message || "The update from another tab could not be read."} Current values were not changed.`;
  }
});

// ---- Minimum player salaries ----
const adminMinHead = document.querySelector("#admin-min-head");
const adminMinRows = document.querySelector("#admin-min-rows");
const minimumYear = () => seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
const minimumSeasons = seasons.filter((year) => year !== 2033); // the table stops at 2032

function renderMinimums(data) {
  const head = document.createElement("tr");
  for (const label of ["YEARS OF EXPERIENCE", ...minimumSeasons.map(String)]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    if (label === String(minimumYear())) th.className = "is-current";
    head.append(th);
  }
  adminMinHead.replaceChildren(head);
  adminMinRows.replaceChildren(...minimumTiers.map((tier) => {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = tier === "0" ? "0 (rookies)" : tier === "7+" ? "7+" : tier;
    row.append(th);
    for (const year of minimumSeasons) {
      const cell = row.insertCell();
      cell.className = `admin-cap-cell${year === minimumYear() ? " is-current" : ""}`;
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 14;
      input.inputMode = "decimal";
      const value = data.minimumSalaries?.[year]?.[tier];
      input.value = value === null || value === undefined ? "" : formatCurrency(value);
      input.placeholder = "—";
      input.dataset.minYear = String(year);
      input.dataset.minTier = tier;
      input.disabled = !safeToSave;
      input.setAttribute("aria-label", `${year} minimum salary for ${minimumTierLabel(tier)} of experience`);
      cell.append(input);
    }
    return row;
  }));
  document.querySelector("#admin-min-copy").disabled = !safeToSave;
}

function saveMinimums(updated, message) {
  if (storageAvailable) {
    try { writeStoredOffice(updated); } catch (error) {
      storageAvailable = false;
      adminStorageNotice.textContent = `Could not save this data in browser storage: ${error.message}. Changes are only in memory until storage is available.`;
      renderMinimums(officeData);
      return false;
    }
  }
  officeData = updated;
  adminStatus.textContent = message;
  return true;
}

adminMinRows.addEventListener("change", (event) => {
  const input = event.target.closest("[data-min-tier]");
  if (!input || !safeToSave) return;
  const year = Number(input.dataset.minYear), tier = input.dataset.minTier;
  const value = input.value.trim() ? parseMoneyText(input.value) : null;
  if (value === undefined) {
    input.setCustomValidity("Enter a whole dollar amount, such as $840,000 or 0.84M.");
    input.reportValidity();
    input.setCustomValidity("");
    const old = officeData.minimumSalaries?.[year]?.[tier];
    input.value = old === null || old === undefined ? "" : formatCurrency(old);
    return;
  }
  const table = JSON.parse(JSON.stringify(officeData.minimumSalaries || {}));
  table[year] = { ...(table[year] || {}), [tier]: value };
  if (saveMinimums({ ...officeData, minimumSalaries: table }, `${year} minimum for ${minimumTierLabel(tier)} of experience ${value === null ? "cleared" : `set to ${formatCurrency(value)}`}.`)) {
    input.value = value === null ? "" : formatCurrency(value);
  }
});
adminMinRows.addEventListener("focusin", (event) => {
  const input = event.target.closest("[data-min-tier]");
  if (input) input.value = input.value.replace(/[$,\s]/g, "");
});
adminMinRows.addEventListener("focusout", (event) => {
  const input = event.target.closest("[data-min-tier]");
  const value = input && parseMoneyText(input.value);
  if (input && value) input.value = formatCurrency(value);
});

// Paste a block of cells from Excel / Google Sheets. Plain values fill right and down from the box you pasted into.
// If the block includes the header row (years) or the experience column, those are used to place each value.
function minimumTierFromLabel(text) {
  const t = String(text || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[–—]/g, "-");
  const m = t.match(/^(0|1|2|3|4-6|7\+)(\(.*\)|yrs?|years?)?$/) || t.match(/^(0|1|2|3|4-6|7\+)(?![\d,.kKmM])/);
  return m && minimumTiers.includes(m[1]) ? m[1] : null;
}
adminMinRows.addEventListener("paste", (event) => {
  const input = event.target.closest("[data-min-tier]");
  const text = event.clipboardData?.getData("text/plain") || "";
  if (!input || !safeToSave || !/[\t\n]/.test(text.trim())) return; // a single value pastes normally
  event.preventDefault();
  let grid = text.replace(/\r/g, "").split("\n").map((line) => line.split("\t"));
  while (grid.length && grid[grid.length - 1].every((c) => !c.trim())) grid.pop();
  // Header row: cells that are seasons in this table.
  let years = null;
  const headerYears = grid[0].map((c) => (/^\s*\d{4}\s*$/.test(c) && minimumSeasons.includes(Number(c)) ? Number(c) : null));
  if (headerYears.some(Boolean)) { years = headerYears; grid = grid.slice(1); }
  else if (grid[0].every((c) => parseMoneyText(c) === undefined || !c.trim())) grid = grid.slice(1); // text-only header
  // Experience column: every row starts with a bracket label and there's more than one column.
  const labelled = grid.length > 0 && grid.every((r) => r.length > 1 && minimumTierFromLabel(r[0]))
    && (years ? years[0] === null : grid.some((r) => /[-+(a-z]/i.test(r[0])) || grid.length === minimumTiers.length);
  const startYearIdx = minimumSeasons.indexOf(Number(input.dataset.minYear));
  const startTierIdx = minimumTiers.indexOf(input.dataset.minTier);
  const table = JSON.parse(JSON.stringify(officeData.minimumSalaries || {}));
  let filled = 0, skipped = 0;
  grid.forEach((row, r) => {
    const tier = labelled ? minimumTierFromLabel(row[0]) : minimumTiers[startTierIdx + r];
    const cells = labelled ? row.slice(1) : row;
    cells.forEach((cell, c) => {
      const col = labelled ? c + 1 : c;
      const year = years ? years[col] : minimumSeasons[startYearIdx + c];
      if (!tier || !year) { if (cell.trim()) skipped += 1; return; }
      const value = parseMoneyText(cell);
      if (value === undefined) { skipped += 1; return; }
      table[year] = { ...(table[year] || {}), [tier]: value };
      filled += 1;
    });
  });
  if (!filled) { adminStatus.textContent = "Nothing to paste: no dollar amounts were found in the copied cells."; return; }
  const extra = skipped ? ` ${skipped} cell${skipped === 1 ? " was" : "s were"} skipped (not a dollar amount, or outside the table).` : "";
  if (saveMinimums({ ...officeData, minimumSalaries: table }, `Pasted ${filled} minimum salar${filled === 1 ? "y" : "ies"}.${extra}`)) renderMinimums(officeData);
});

document.querySelector("#admin-min-copy").addEventListener("click", () => {
  const from = minimumYear();
  const source = officeData.minimumSalaries?.[from] || {};
  if (!minimumTiers.some((tier) => source[tier] != null)) { adminStatus.textContent = `Enter the ${from} minimums first.`; return; }
  const table = JSON.parse(JSON.stringify(officeData.minimumSalaries || {}));
  let filled = 0;
  for (const year of minimumSeasons.filter((y) => y > from)) {
    table[year] = { ...(table[year] || {}) };
    for (const tier of minimumTiers) {
      if (table[year][tier] == null && source[tier] != null) { table[year][tier] = source[tier]; filled += 1; }
    }
  }
  if (!filled) { adminStatus.textContent = "Every later season already has its minimums."; return; }
  if (saveMinimums({ ...officeData, minimumSalaries: table }, `Copied the ${from} minimums into ${filled} blank box${filled === 1 ? "" : "es"} for later seasons.`)) renderMinimums(officeData);
});

renderMinimums(officeData);
window.addEventListener("storage", (event) => {
  if (event.key === officeStorageKey) renderMinimums(officeData);
});

// ---- Veteran Minimum Benefit bonus limits ----
const adminVmbHead = document.querySelector("#admin-vmb-head");
const adminVmbRows = document.querySelector("#admin-vmb-rows");
function renderVmbLimits(data) {
  const head = document.createElement("tr");
  for (const label of ["", `${minimumYear()} BONUS LIMIT`]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    if (label) th.className = "is-current";
    head.append(th);
  }
  adminVmbHead.replaceChildren(head);
  const row = document.createElement("tr");
  const th = document.createElement("th");
  th.scope = "row";
  th.textContent = "Bonus limit";
  row.append(th);
  for (const year of [minimumYear()]) {  // only the current league year
    const cell = row.insertCell();
    cell.className = `admin-cap-cell${year === minimumYear() ? " is-current" : ""}`;
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.maxLength = 14;
    const value = vmbBonusLimitFor(data, year);
    input.value = value === null ? "" : formatCurrency(value);
    input.placeholder = "No limit";
    input.dataset.vmbYear = String(year);
    input.disabled = !safeToSave;
    input.setAttribute("aria-label", `${year} Veteran Minimum Benefit bonus limit`);
    cell.append(input);
  }
  adminVmbRows.replaceChildren(row);
}
adminVmbRows.addEventListener("change", (event) => {
  const input = event.target.closest("[data-vmb-year]");
  if (!input || !safeToSave) return;
  const year = Number(input.dataset.vmbYear);
  const value = input.value.trim() ? parseMoneyText(input.value) : null;
  if (value === undefined) {
    input.setCustomValidity("Enter a whole dollar amount, such as $187,500.");
    input.reportValidity();
    input.setCustomValidity("");
    const old = vmbBonusLimitFor(officeData, year);
    input.value = old === null ? "" : formatCurrency(old);
    return;
  }
  const updated = { ...officeData, vmbBonusLimits: { ...(officeData.vmbBonusLimits || {}), [year]: value } };
  if (saveMinimums(updated, `${year} Veteran Minimum Benefit bonus limit ${value === null ? "removed" : `set to ${formatCurrency(value)}`}.`)) input.value = value === null ? "" : formatCurrency(value);
});
adminVmbRows.addEventListener("focusin", (event) => {
  const input = event.target.closest("[data-vmb-year]");
  if (input) input.value = input.value.replace(/[$,\s]/g, "");
});
adminVmbRows.addEventListener("focusout", (event) => {
  const input = event.target.closest("[data-vmb-year]");
  const value = input && parseMoneyText(input.value);
  if (input && value) input.value = formatCurrency(value);
});
renderVmbLimits(officeData);
window.addEventListener("storage", (event) => {
  if (event.key === officeStorageKey) renderVmbLimits(officeData);
});


// ---- Practice squad weekly salaries (by experience tier and season) and the current week ----
const adminPsHead = document.querySelector("#admin-ps-head");
const adminPsRows = document.querySelector("#admin-ps-rows");
const adminPsWeek = document.querySelector("#admin-ps-week");
function renderPsSalaries(data) {
  const head = document.createElement("tr");
  for (const label of ["EXPERIENCE", `${minimumYear()} WEEKLY SALARY`]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    if (label !== "EXPERIENCE") th.className = "is-current";
    head.append(th);
  }
  adminPsHead.replaceChildren(head);
  adminPsRows.replaceChildren(...psSalaryTiers.map(([tier, label]) => {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = label;
    row.append(th);
    for (const year of [minimumYear()]) {  // only the current league year is needed
      const cell = row.insertCell();
      cell.className = `admin-cap-cell${year === minimumYear() ? " is-current" : ""}`;
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.maxLength = 12;
      const value = data.psWeeklySalaries?.[year]?.[tier];
      input.value = value === null || value === undefined ? "" : formatCurrency(value);
      input.placeholder = "Not set";
      input.dataset.psYear = String(year);
      input.dataset.psTier = tier;
      input.disabled = !safeToSave;
      input.setAttribute("aria-label", `${year} practice squad weekly salary, ${label} of experience`);
      cell.append(input);
    }
    return row;
  }));
  // Current week
  const { week, source } = leagueCurrentWeek(data);
  adminPsWeek.replaceChildren(new Option("Automatic (from box scores)", ""),
    ...Array.from({ length: regularSeasonWeeks }, (_, i) => new Option(`Week ${i + 1}`, String(i + 1))),
    new Option("Regular season over", String(regularSeasonWeeks + 1)));
  adminPsWeek.value = source === "set" ? String(week) : "";
  adminPsWeek.disabled = !safeToSave;
  const left = psWeeksRemaining(data);
  document.querySelector("#admin-ps-week-note").textContent =
    `${week > regularSeasonWeeks ? "The regular season is over" : `It's week ${week}`}${source === "games" ? " (the week after the last logged box score)" : source === "default" ? " (no box scores logged yet)" : ""}: ` +
    `a player joining a practice squad now is paid for ${left} week${left === 1 ? "" : "s"}.`;
}
adminPsRows.addEventListener("change", (event) => {
  const input = event.target.closest("[data-ps-tier]");
  if (!input || !safeToSave) return;
  const year = Number(input.dataset.psYear), tier = input.dataset.psTier;
  const value = input.value.trim() ? parseMoneyText(input.value) : null;
  const old = officeData.psWeeklySalaries?.[year]?.[tier];
  if (value === undefined || (value !== null && value > 9999999)) {
    input.setCustomValidity("Enter a whole dollar amount per week, such as $14,000.");
    input.reportValidity();
    input.setCustomValidity("");
    input.value = old === null || old === undefined ? "" : formatCurrency(old);
    return;
  }
  const table = JSON.parse(JSON.stringify(officeData.psWeeklySalaries || {}));
  table[year] = { ...(table[year] || {}), [tier]: value };
  const label = psSalaryTiers.find(([t]) => t === tier)[1];
  if (saveMinimums({ ...officeData, psWeeklySalaries: table }, `${year} practice squad pay for ${label} ${value === null ? "cleared" : `set to ${formatCurrency(value)} a week`}.`)) {
    input.value = value === null ? "" : formatCurrency(value);
  }
});
adminPsRows.addEventListener("focusin", (event) => {
  const input = event.target.closest("[data-ps-tier]");
  if (input) input.value = input.value.replace(/[$,\s]/g, "");
});
adminPsRows.addEventListener("focusout", (event) => {
  const input = event.target.closest("[data-ps-tier]");
  const value = input && parseMoneyText(input.value);
  if (input && value) input.value = formatCurrency(value);
});
adminPsWeek.addEventListener("change", () => {
  if (!safeToSave) return;
  const updated = { ...officeData };
  if (adminPsWeek.value) updated.currentWeek = Number(adminPsWeek.value); else delete updated.currentWeek;
  if (saveMinimums(updated, adminPsWeek.value ? `Current week set to ${adminPsWeek.selectedOptions[0].textContent}.` : "Current week now follows the logged box scores.")) renderPsSalaries(officeData);
});
renderPsSalaries(officeData);
window.addEventListener("storage", (event) => {
  if (event.key === officeStorageKey) renderPsSalaries(officeData);
});
