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
