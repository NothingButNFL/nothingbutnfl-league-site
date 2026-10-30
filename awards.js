// League Awards. Entries live in officeData.awards (league-core.js).
const awardsGrid = document.querySelector("#awards-grid");
const awardsRows = document.querySelector("#awards-rows");
const awardsStatus = document.querySelector("#awards-status");
const awardsNotice = document.querySelector("#awards-storage-notice");
const awardsEmpty = document.querySelector("#awards-empty");
const awardsSeasonSelect = document.querySelector("#awards-season");
const awardsForm = document.querySelector("#awards-form");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  awardsNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.awards)) officeData.awards = [];

const thisSeason = () => officeData.standings?.season || currentLeagueYear();
let viewSeason = thisSeason();

function save(message) {
  try {
    writeStoredOffice(officeData);
    awardsStatus.textContent = message;
  } catch (error) {
    awardsStatus.textContent = `Could not save: ${error.message}.`;
  }
}

const presetRank = (award) => { const i = awardPresets.indexOf(award); return i === -1 ? awardPresets.length : i; };

function fillSeasons() {
  const years = [...new Set([thisSeason(), ...officeData.awards.map((a) => a.season)])].sort((a, b) => b - a);
  awardsSeasonSelect.replaceChildren(...years.map((year) => new Option(String(year), String(year))));
  if (!years.includes(viewSeason)) viewSeason = years[0];
  awardsSeasonSelect.value = String(viewSeason);
}

function teamTag(teamId) {
  if (!teamId) return document.createTextNode("");
  const link = document.createElement("a");
  link.className = "txn-team";
  link.href = `team.html?team=${encodeURIComponent(teamId)}`;
  link.title = teamName(teamId);
  link.textContent = teamId;
  return link;
}

function winnerNode(entry) {
  const found = findPlayerByName(officeData, entry.winner, entry.teamId || undefined);
  if (found) {
    const link = document.createElement("a");
    link.className = "player-name-link";
    link.href = profileUrl(found.player.id);
    link.textContent = entry.winner;
    return link;
  }
  return document.createTextNode(entry.winner);
}

function renderAwards() {
  fillSeasons();
  document.querySelector("#awards-season-label").textContent = String(viewSeason);
  const seasonAwards = officeData.awards.filter((a) => a.season === viewSeason);
  const names = [...new Set([...awardPresets, ...seasonAwards.map((a) => a.award)])].sort((a, b) => presetRank(a) - presetRank(b));
  awardsGrid.replaceChildren(...names.map((award) => {
    const entry = seasonAwards.find((a) => a.award === award);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `award-card${entry ? "" : " is-open"}${/super bowl champion/i.test(award) ? " is-champion" : ""}`;
    card.dataset.award = award;
    card.title = entry ? `Change the ${award} winner` : `Set the ${viewSeason} ${award}`;
    const label = document.createElement("span");
    label.className = "award-name";
    label.textContent = award;
    const winner = document.createElement("strong");
    winner.className = "award-winner";
    winner.textContent = entry ? entry.winner : "To be announced";
    const meta = document.createElement("span");
    meta.className = "award-meta";
    meta.textContent = entry ? [entry.position, entry.teamId ? teamName(entry.teamId) : ""].filter(Boolean).join(" · ") : "Click to set the winner";
    card.append(label, winner, meta);
    if (entry?.notes) {
      const notes = document.createElement("span");
      notes.className = "award-notes";
      notes.textContent = entry.notes;
      card.append(notes);
    }
    return card;
  }));

  // History table.
  const all = [...officeData.awards].sort((a, b) => b.season - a.season || presetRank(a.award) - presetRank(b.award) || a.award.localeCompare(b.award));
  awardsRows.replaceChildren(...all.map((entry) => {
    const tr = document.createElement("tr");
    tr.dataset.awardId = entry.id;
    tr.insertCell().textContent = String(entry.season);
    const award = tr.insertCell();
    award.className = "award-cell-name";
    award.textContent = entry.award;
    const winner = tr.insertCell();
    winner.className = "award-cell-winner";
    winner.append(winnerNode(entry));
    if (entry.position) {
      const pos = document.createElement("small");
      pos.textContent = ` ${entry.position}`;
      winner.append(pos);
    }
    tr.insertCell().append(teamTag(entry.teamId));
    tr.insertCell().textContent = entry.notes || "—";
    const actions = tr.insertCell();
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-delete";
    remove.dataset.action = "remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove the ${entry.season} ${entry.award}`);
    remove.disabled = !canSave;
    actions.append(remove);
    return tr;
  }));
  awardsEmpty.hidden = all.length > 0;
  awardsEmpty.textContent = "No awards yet. Click an award above to name its first winner.";
}

awardsSeasonSelect.addEventListener("change", () => { viewSeason = Number(awardsSeasonSelect.value); renderAwards(); });

function openForm(award, entry) {
  const f = awardsForm.elements;
  f.season.value = String(viewSeason);
  f.award.value = award;
  f.winner.value = entry?.winner || "";
  f.team.value = entry?.teamId || "";
  f.position.value = entry?.position || "";
  f.notes.value = entry?.notes || "";
  document.querySelector("#awards-form-title").textContent = entry ? `Change the ${viewSeason} ${award}` : `Set the ${viewSeason} ${award}`;
  document.querySelector("#awards-editor").scrollIntoView({ behavior: "smooth", block: "center" });
  f.winner.focus({ preventScroll: true });
}

awardsGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-award]");
  if (!card || !canSave) return;
  const award = card.dataset.award;
  openForm(award, officeData.awards.find((a) => a.season === viewSeason && a.award === award));
});

awardsRows.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="remove"]');
  const tr = button?.closest("tr");
  const entry = tr && officeData.awards.find(({ id }) => id === tr.dataset.awardId);
  if (!entry || !canSave) return;
  const ok = await confirmAction(`Remove ${entry.winner} as the ${entry.season} ${entry.award}?`, { confirmLabel: "Remove award", danger: true });
  if (!ok) return;
  officeData.awards = officeData.awards.filter(({ id }) => id !== entry.id);
  save(`${entry.season} ${entry.award} removed.`);
  renderAwards();
});

// ---- Form ----
document.querySelector("#award-presets").append(...awardPresets.map((name) => new Option(name, name)));
awardsForm.elements.team.append(new Option("No team", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));

function fillPlayerSuggestions() {
  const year = currentLeagueYear();
  const people = [];
  for (const { id } of nflTeams) {
    for (const player of officeData.teams[id].roster) people.push({ name: player.name, teamId: id, position: (player.seasons[year] || {}).position || "" });
  }
  for (const player of officeData.contractPlayers || []) people.push({ name: player.name, teamId: player.team, position: player.position || "" });
  for (const member of officeData.members || []) people.push({ name: member.name, teamId: member.teamId, position: member.role || "" });
  const seen = new Set();
  document.querySelector("#award-players").replaceChildren(...people.filter((p) => !seen.has(p.name) && seen.add(p.name)).map((p) => {
    const option = document.createElement("option");
    option.value = p.name;
    option.label = [p.position, p.teamId && p.teamId !== freeAgentTeamId ? p.teamId : ""].filter(Boolean).join(" · ");
    return option;
  }));
  return people;
}
let suggestionPeople = fillPlayerSuggestions();

// Picking a known player fills team and position.
awardsForm.elements.winner.addEventListener("change", () => {
  const key = normalizePlayerName(awardsForm.elements.winner.value);
  const matches = suggestionPeople.filter((p) => normalizePlayerName(p.name) === key);
  if (matches.length !== 1) return;
  const [match] = matches;
  if (match.teamId && nflTeams.some(({ id }) => id === match.teamId)) awardsForm.elements.team.value = match.teamId;
  if (!awardsForm.elements.position.value && match.position && match.position.length <= 10) awardsForm.elements.position.value = match.position;
});

awardsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !awardsForm.reportValidity()) return;
  const f = awardsForm.elements;
  const season = Number(f.season.value);
  const award = f.award.value.trim().slice(0, awardTextLimits.award);
  const existing = officeData.awards.find((a) => a.season === season && a.award.toLowerCase() === award.toLowerCase());
  if (!existing && officeData.awards.length >= 2000) { awardsStatus.textContent = "The awards list has reached its limit."; return; }
  const entry = existing || { id: newRecordId("award"), season, award };
  entry.winner = f.winner.value.trim().slice(0, awardTextLimits.winner);
  entry.teamId = f.team.value;
  for (const field of ["position", "notes"]) {
    const value = f[field].value.trim();
    if (value) entry[field] = value.slice(0, awardTextLimits[field]); else delete entry[field];
  }
  if (!existing) officeData.awards.push(entry);
  viewSeason = season;
  save(`${entry.winner} named the ${season} ${entry.award}.`);
  awardsForm.reset();
  f.season.value = String(viewSeason);
  document.querySelector("#awards-form-title").textContent = "Add an award";
  renderAwards();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.awards)) officeData.awards = [];
    suggestionPeople = fillPlayerSuggestions();
    renderAwards();
  } catch {
    awardsStatus.textContent = "An update from another tab could not be read.";
  }
});

if (!canSave) for (const element of awardsForm.elements) element.disabled = true;
awardsForm.elements.season.value = String(viewSeason);
renderAwards();
