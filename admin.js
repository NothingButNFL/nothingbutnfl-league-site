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
  for (const label of ["", ...minimumSeasons.map(String)]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    if (label === String(minimumYear())) th.className = "is-current";
    head.append(th);
  }
  adminVmbHead.replaceChildren(head);
  const row = document.createElement("tr");
  const th = document.createElement("th");
  th.scope = "row";
  th.textContent = "Bonus limit";
  row.append(th);
  for (const year of minimumSeasons) {
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
