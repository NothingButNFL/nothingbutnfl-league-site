// Admin › Draft Pick Manager. Every pick lives in officeData.picks (league-core.js);
// team pages show the picks whose currentOwner is that team.
const picksRows = document.querySelector("#picks-rows");
const picksStatus = document.querySelector("#picks-status");
const picksNotice = document.querySelector("#picks-storage-notice");
const picksEmpty = document.querySelector("#picks-empty");
const picksCount = document.querySelector("#picks-count");
const ownerSummary = document.querySelector("#picks-owner-summary");
const filterYear = document.querySelector("#picks-filter-year");
const filterRound = document.querySelector("#picks-filter-round");
const filterOriginal = document.querySelector("#picks-filter-original");
const filterOwner = document.querySelector("#picks-filter-owner");
const filterTraded = document.querySelector("#picks-filter-traded");
const generateForm = document.querySelector("#picks-generate-form");
const addForm = document.querySelector("#picks-add-form");
const deleteYearButton = document.querySelector("#picks-delete-year");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  picksNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}

const teamLabel = (id) => `${teamName(id)} (${id})`;
const pickKey = (pick) => `${pick.year}:${pick.round}:${pick.compensatory ? "comp" : "reg"}:${pick.originalTeam}`;
const pickLabel = (pick) => `${pick.year} round ${pickRoundLabel(pick)} (${pick.originalTeam})`;

function save(message) {
  try {
    writeStoredOffice(officeData);
    picksStatus.textContent = message;
  } catch (error) {
    picksStatus.textContent = `Could not save: ${error.message}.`;
  }
}

function teamSelect(value, field, label) {
  const select = document.createElement("select");
  select.dataset.field = field;
  select.setAttribute("aria-label", label);
  for (const { id } of nflTeams) select.add(new Option(teamLabel(id), id));
  select.value = value;
  return select;
}

function fillFilters() {
  const keep = [filterYear.value, filterRound.value, filterOriginal.value, filterOwner.value];
  const years = [...new Set(officeData.picks.map((pick) => pick.year))].sort((a, b) => a - b);
  const rounds = [...new Set(officeData.picks.map((pick) => pick.round))].sort((a, b) => a - b);
  filterYear.replaceChildren(new Option("All years", ""), ...years.map((year) => new Option(String(year), String(year))));
  filterRound.replaceChildren(new Option("All rounds", ""), ...rounds.map((round) => new Option(`Round ${round}`, String(round))));
  for (const select of [filterOriginal, filterOwner]) {
    select.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id }) => new Option(teamLabel(id), id)));
  }
  filterYear.value = years.map(String).includes(keep[0]) ? keep[0] : "";
  filterRound.value = rounds.map(String).includes(keep[1]) ? keep[1] : "";
  filterOriginal.value = keep[2];
  filterOwner.value = keep[3];
}

function renderPicks() {
  fillFilters();
  // Every filter except owner; the per-team chips count from this so they stay meaningful.
  const beforeOwner = officeData.picks.filter((pick) =>
    (!filterYear.value || pick.year === Number(filterYear.value)) &&
    (!filterRound.value || pick.round === Number(filterRound.value)) &&
    (!filterOriginal.value || pick.originalTeam === filterOriginal.value) &&
    (!filterTraded.checked || pick.currentOwner !== pick.originalTeam));
  const filtered = beforeOwner.filter((pick) => !filterOwner.value || pick.currentOwner === filterOwner.value).sort(comparePicks);

  const fragment = document.createDocumentFragment();
  for (const pick of filtered) {
    const tr = document.createElement("tr");
    tr.dataset.pickId = pick.id;
    if (pick.currentOwner !== pick.originalTeam) tr.className = "is-traded";
    tr.insertCell().textContent = String(pick.year);
    tr.insertCell().append(teamSelect(pick.currentOwner, "currentOwner", `${pickLabel(pick)} current owner`));
    const roundCell = tr.insertCell();
    roundCell.textContent = `Round ${pickRoundLabel(pick)}`;
    if (pick.compensatory) roundCell.title = "Compensatory pick (bottom of the round)";
    tr.insertCell().textContent = teamLabel(pick.originalTeam);
    const note = document.createElement("input");
    note.type = "text";
    note.maxLength = pickNoteMaxLength;
    note.value = pick.note || "";
    note.placeholder = "—";
    note.dataset.field = "note";
    note.setAttribute("aria-label", `${pickLabel(pick)} notes`);
    tr.insertCell().append(note);
    const actions = tr.insertCell();
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-delete";
    remove.dataset.action = "delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove the ${pickLabel(pick)} pick`);
    actions.append(remove);
    fragment.append(tr);
  }
  picksRows.replaceChildren(fragment);
  if (!canSave) document.querySelectorAll("main input, main select, main button, main textarea").forEach((el) => {
    if (!el.closest(".contracts-toolbar")) el.disabled = true;
  });

  picksCount.textContent = filtered.length.toLocaleString("en-US");
  picksEmpty.hidden = filtered.length > 0;
  picksEmpty.textContent = officeData.picks.length
    ? "No picks match these filters."
    : "No draft picks yet. Create a draft year above to give every team its picks.";

  // How many picks each team owns, using every filter except Current owner.
  const owned = new Map(nflTeams.map(({ id }) => [id, 0]));
  for (const pick of beforeOwner) owned.set(pick.currentOwner, owned.get(pick.currentOwner) + 1);
  ownerSummary.replaceChildren(...nflTeams.map(({ id }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `picks-owner-chip${filterOwner.value === id ? " is-active" : ""}`;
    chip.dataset.owner = id;
    chip.title = `${teamName(id)} owns ${owned.get(id)} ${owned.get(id) === 1 ? "pick" : "picks"} matching the other filters. Click to show only theirs`;
    chip.innerHTML = `<span>${id}</span><strong>${owned.get(id)}</strong>`;
    return chip;
  }));

  const year = filterYear.value;
  deleteYearButton.disabled = !canSave || !year;
  deleteYearButton.textContent = year ? `Remove every ${year} pick` : "Choose a draft year to remove its picks";
  deleteYearButton.classList.remove("is-armed");
}

for (const control of [filterYear, filterRound, filterOriginal, filterOwner, filterTraded]) {
  control.addEventListener("change", renderPicks);
}
ownerSummary.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-owner]");
  if (!chip) return;
  filterOwner.value = filterOwner.value === chip.dataset.owner ? "" : chip.dataset.owner;
  renderPicks();
});

picksRows.addEventListener("change", (event) => {
  const input = event.target.closest("[data-field]");
  const tr = input?.closest("tr");
  const pick = tr && officeData.picks.find(({ id }) => id === tr.dataset.pickId);
  if (!pick || !canSave) return;
  if (input.dataset.field === "currentOwner") {
    pick.currentOwner = input.value;
    tr.classList.toggle("is-traded", pick.currentOwner !== pick.originalTeam);
    save(`${pickLabel(pick)} now belongs to ${teamName(pick.currentOwner)}.`);
    renderPicks();
  } else if (input.dataset.field === "note") {
    pick.note = input.value.trim();
    save(`Notes updated for ${pickLabel(pick)}.`);
  }
});

// Two-click delete so a stray click doesn't remove a pick.
function armOrRun(button, armedText, run) {
  if (!button.classList.contains("is-armed")) {
    const original = button.textContent;
    button.classList.add("is-armed");
    button.textContent = armedText;
    setTimeout(() => {
      if (!button.isConnected || !button.classList.contains("is-armed")) return;
      button.classList.remove("is-armed");
      button.textContent = original;
    }, 4000);
    return;
  }
  run();
}

picksRows.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="delete"]');
  const tr = button?.closest("tr");
  const pick = tr && officeData.picks.find(({ id }) => id === tr.dataset.pickId);
  if (!pick || !canSave) return;
  armOrRun(button, "Remove?", () => {
    officeData.picks = officeData.picks.filter(({ id }) => id !== pick.id);
    save(`${pickLabel(pick)} removed.`);
    renderPicks();
  });
});

deleteYearButton.addEventListener("click", () => {
  const year = Number(filterYear.value);
  if (!year || !canSave) return;
  const count = officeData.picks.filter((pick) => pick.year === year).length;
  armOrRun(deleteYearButton, `Click again to remove ${count === 1 ? "the 1 pick" : `all ${count} picks`} in ${year}`, () => {
    officeData.picks = officeData.picks.filter((pick) => pick.year !== year);
    filterYear.value = "";
    save(`Removed ${count === 1 ? "the 1 pick" : `all ${count} picks`} in the ${year} draft.`);
    renderPicks();
  });
});

// ---- Create a whole draft year ----
generateForm.elements.year.value = String(currentLeagueYear() + 1);
generateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !generateForm.reportValidity()) return;
  const year = Number(generateForm.elements.year.value);
  const rounds = Number(generateForm.elements.rounds.value);
  const existing = new Set(officeData.picks.map(pickKey));
  let created = 0;
  for (let round = 1; round <= rounds; round += 1) {
    for (const { id } of nflTeams) {
      const pick = { id: newRecordId("pick"), year, round, originalTeam: id, currentOwner: id };
      if (existing.has(pickKey(pick))) continue;
      officeData.picks.push(pick);
      created += 1;
    }
  }
  if (officeData.picks.length > 5000) {
    officeData = readStoredOffice() || emptyOfficeData();
    picksStatus.textContent = "That would go over the 5,000-pick limit. No picks were created.";
    return;
  }
  const skipped = rounds * nflTeams.length - created;
  filterYear.value = String(year);
  save(`Created ${created} picks for the ${year} draft (${rounds} ${rounds === 1 ? "round" : "rounds"} × 32 teams)${skipped ? `; ${skipped} already existed and were left as they were` : ""}.`);
  renderPicks();
});

// ---- Add one pick ----
for (const name of ["originalTeam", "currentOwner"]) {
  for (const { id } of nflTeams) addForm.elements[name].add(new Option(teamLabel(id), id));
}
addForm.elements.year.value = String(currentLeagueYear() + 1);
addForm.elements.originalTeam.addEventListener("change", () => {
  addForm.elements.currentOwner.value = addForm.elements.originalTeam.value;
});
addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !addForm.reportValidity()) return;
  const roundInput = addForm.elements.round;
  const parsedRound = parsePickRound(roundInput.value);
  if (!parsedRound) {
    roundInput.setCustomValidity("Enter a round from 1 to 20. Add * for a compensatory pick, like 5*.");
    roundInput.reportValidity();
    roundInput.setCustomValidity("");
    return;
  }
  const pick = {
    id: newRecordId("pick"),
    year: Number(addForm.elements.year.value),
    round: parsedRound.round,
    originalTeam: addForm.elements.originalTeam.value,
    currentOwner: addForm.elements.currentOwner.value
  };
  if (parsedRound.compensatory) pick.compensatory = true;
  const note = addForm.elements.note.value.trim();
  if (note) pick.note = note;
  // A team can hold more than one pick from the same round and type.
  const sameSlot = officeData.picks.filter((other) => pickKey(other) === pickKey(pick)).length;
  if (officeData.picks.length >= 5000) {
    picksStatus.textContent = "The pick ledger has reached its 5,000-pick limit.";
    return;
  }
  officeData.picks.push(pick);
  addForm.elements.round.value = "";
  addForm.elements.note.value = "";
  save(sameSlot
    ? `Added another ${pickLabel(pick)} pick, owned by ${teamName(pick.currentOwner)}. ${pick.originalTeam} now has ${sameSlot + 1} of these; a note helps tell them apart.`
    : `Added the ${pickLabel(pick)} pick, owned by ${teamName(pick.currentOwner)}.`);
  renderPicks();
});

// ---- Paste import ----
function pickFieldForHeader(header) {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["year", "draftyear", "season", "draft"].includes(h)) return "year";
  if (["round", "rd", "rnd", "draftround"].includes(h)) return "round";
  if (h.includes("original") || ["from", "team", "originalteam", "pickfrom"].includes(h)) return "originalTeam";
  if (h.includes("owner") || h.includes("current") || ["ownedby", "holder", "to"].includes(h)) return "currentOwner";
  if (h.includes("note") || h.includes("condition") || h.includes("protect") || h === "comments") return "note";
  return null;
}

function pickTeamFromText(text) {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  return lookupTeamId(value) || undefined;
}

document.querySelector("#picks-paste-import").addEventListener("click", () => {
  if (!canSave) return;
  const lines = document.querySelector("#picks-paste-input").value.replace(/^﻿/, "").split(/\r?\n/)
    .filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => {
    const fields = line.split("\t").map(pickFieldForHeader);
    return fields.includes("year") && fields.includes("round") && fields.includes("originalTeam");
  });
  if (headerIndex === -1) {
    picksStatus.textContent = "Couldn't find a header row with Year, Round and Original columns. Include your header row when you copy. No changes were made.";
    return;
  }
  const columns = new Map();
  lines[headerIndex].split("\t").forEach((cell, index) => {
    const field = pickFieldForHeader(cell);
    if (field && !columns.has(field)) columns.set(field, index);
  });
  // Picks sharing a year, round and original team (compensatory picks, for example)
  // are matched in order: the 1st pasted row updates the 1st such pick, the 2nd the
  // 2nd, and any extra rows become new picks. Re-pasting the same sheet adds nothing.
  const byKey = new Map();
  for (const pick of officeData.picks) {
    if (!byKey.has(pickKey(pick))) byKey.set(pickKey(pick), []);
    byKey.get(pickKey(pick)).push(pick);
  }
  const usedPerKey = new Map();
  let added = 0;
  let updated = 0;
  const problems = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = lines[index].split("\t");
    const cell = (field) => (columns.has(field) ? (cells[columns.get(field)] ?? "").trim() : "");
    if (cells.every((value) => !value.trim())) continue;
    const rowLabel = `row ${index + 1}`;
    const year = Number(cell("year"));
    const parsedRound = parsePickRound(cell("round"));
    const round = parsedRound?.round;
    const originalTeam = pickTeamFromText(cell("originalTeam"));
    const ownerText = cell("currentOwner");
    const currentOwner = ownerText ? pickTeamFromText(ownerText) : originalTeam;
    const note = cell("note");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) { problems.push(`${rowLabel}: year "${cell("year")}"`); continue; }
    if (!parsedRound) { problems.push(`${rowLabel}: round "${cell("round")}"`); continue; }
    if (!originalTeam) { problems.push(`${rowLabel}: original team "${cell("originalTeam")}"`); continue; }
    if (!currentOwner) { problems.push(`${rowLabel}: current owner "${ownerText}"`); continue; }
    if (note.length > pickNoteMaxLength) { problems.push(`${rowLabel}: notes longer than ${pickNoteMaxLength} characters`); continue; }
    const key = pickKey({ year, round, compensatory: parsedRound.compensatory, originalTeam });
    const slot = usedPerKey.get(key) || 0;
    const existing = (byKey.get(key) || [])[slot];
    usedPerKey.set(key, slot + 1);
    if (existing) {
      existing.currentOwner = currentOwner;
      if (columns.has("note")) existing.note = note;
      updated += 1;
      continue;
    }
    if (officeData.picks.length >= 5000) { problems.push(`${rowLabel}: the 5,000-pick limit was reached`); continue; }
    const pick = { id: newRecordId("pick"), year, round, originalTeam, currentOwner };
    if (parsedRound.compensatory) pick.compensatory = true;
    if (note) pick.note = note;
    officeData.picks.push(pick);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(pick);
    added += 1;
  }
  const parts = [`Added ${added} ${added === 1 ? "pick" : "picks"} and updated ${updated}.`];
  if (problems.length) {
    parts.push(`Skipped ${problems.length} ${problems.length === 1 ? "row" : "rows"} with problems: ${problems.slice(0, 10).join("; ")}${problems.length > 10 ? "; …" : ""}.`);
  }
  if (added || updated) {
    document.querySelector("#picks-paste-input").value = "";
    document.querySelector("#picks-import-panel").open = false;
    save(parts.join(" "));
  } else {
    picksStatus.textContent = parts.join(" ");
  }
  renderPicks();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    renderPicks();
  } catch {
    picksStatus.textContent = "An update from another tab could not be read.";
  }
});

renderPicks();
