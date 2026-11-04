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

// Every season from now back ten years (or to the oldest saved award) is listed, so past winners can be set.
function fillSeasons() {
  const now = thisSeason();
  const saved = officeData.awards.map((a) => a.season);
  const oldest = Math.min(now - 10, viewSeason, ...saved);
  const newest = Math.max(now, viewSeason, ...saved);
  const years = [];
  for (let year = newest; year >= oldest; year -= 1) years.push(year);
  awardsSeasonSelect.replaceChildren(...years.map((year) => {
    const set = officeData.awards.filter((a) => a.season === year && awardPresets.includes(a.award)).length;
    const label = `${year}${year === now ? " (current)" : ""}${set ? ` · ${set} of ${awardPresets.length} set` : ""}`;
    return new Option(label, String(year));
  }));
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
  const seasonLabel = document.querySelector("#awards-season-label"); if (seasonLabel) seasonLabel.textContent = String(viewSeason);
  document.querySelector("#awards-prev").disabled = viewSeason <= 1920;
  document.querySelector("#awards-next").disabled = viewSeason >= thisSeason();
  const past = document.querySelector("#awards-past-note");
  past.hidden = viewSeason >= thisSeason();
  past.textContent = `You're viewing the ${viewSeason} season. Click any award to set its ${viewSeason} winner.`;
  const seasonAwards = officeData.awards.filter((a) => a.season === viewSeason);
  const names = [...new Set([...awardPresets, ...seasonAwards.map((a) => a.award)])].sort((a, b) => presetRank(a) - presetRank(b));
  awardsGrid.replaceChildren(...names.map((award) => {
    const entry = seasonAwards.find((a) => a.award === award);
    const card = document.createElement("button");
    card.type = "button";
    const info = awardDetails(award);
    card.className = `award-card${entry ? "" : " is-open"}${info?.about ? " is-named" : ""}`;
    card.dataset.award = award;
    card.title = entry ? `Change the ${award} winner` : `Set the ${viewSeason} ${award}`;
    const label = document.createElement("span");
    label.className = "award-name";
    if (info && !info.about) {
      const short = document.createElement("b");
      short.className = "award-short";
      short.textContent = info.short;
      label.append(short, award);
    } else {
      label.textContent = award;
    }
    if (info?.about) {
      const about = document.createElement("span");
      about.className = "award-about";
      about.textContent = info.about;
      label.append(about);
    }
    const winner = document.createElement("strong");
    winner.className = "award-winner";
    winner.textContent = entry ? entry.winner : "To be announced";
    const meta = document.createElement("span");
    meta.className = "award-meta";
    meta.textContent = entry ? [entry.position, entry.teamId ? teamName(entry.teamId) : ""].filter(Boolean).join(" · ") : "Click to set the winner";
    card.append(label, winner, meta);
    if (entry && statTiles(entry.line).length) card.append(statTilesNode(entry.line));
    else if (entry?.notes) {
      const notes = document.createElement("span");
      notes.className = "award-notes";
      notes.textContent = entry.notes;
      card.append(notes);
    }
    return card;
  }));

  // History table.
  const sortedAll = [...officeData.awards].sort((a, b) => b.season - a.season || presetRank(a.award) - presetRank(b.award) || a.award.localeCompare(b.award));
  fillFilters();
  const all = sortedAll.filter((a) => (!filterSeason.value || a.season === Number(filterSeason.value)) && (!filterAward.value || a.award === filterAward.value));
  const filtering = Boolean(filterSeason.value || filterAward.value);
  document.querySelector("#awards-filter-clear").hidden = !filtering;
  document.querySelector("#awards-filter-count").textContent = filtering ? `${all.length} of ${sortedAll.length} award${sortedAll.length === 1 ? "" : "s"}` : `${sortedAll.length} award${sortedAll.length === 1 ? "" : "s"}`;
  awardsRows.replaceChildren(...all.map((entry) => {
    const tr = document.createElement("tr");
    tr.dataset.awardId = entry.id;
    tr.insertCell().textContent = String(entry.season);
    const award = tr.insertCell();
    award.className = "award-cell-name";
    const details = awardDetails(entry.award);
    award.textContent = details ? `${entry.award} (${details.about || details.short})` : entry.award;
    const winner = tr.insertCell();
    winner.className = "award-cell-winner";
    winner.append(winnerNode(entry));
    if (entry.position) {
      const pos = document.createElement("small");
      pos.textContent = ` ${entry.position}`;
      winner.append(pos);
    }
    tr.insertCell().append(teamTag(entry.teamId));
    const stats = tr.insertCell();
    stats.className = "award-cell-stats";
    if (statTiles(entry.line).length) stats.append(statTilesNode(entry.line));
    else stats.textContent = entry.notes || "—";
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
  awardsEmpty.textContent = sortedAll.length ? "No awards match these filters." : "No awards yet. Click an award above to name its first winner.";
}

// ---- History filters ----
const filterSeason = document.querySelector("#awards-filter-season");
const filterAward = document.querySelector("#awards-filter-award");
function fillFilters() {
  const keepSeason = filterSeason.value, keepAward = filterAward.value;
  const years = [...new Set(officeData.awards.map((a) => a.season))].sort((a, b) => b - a);
  filterSeason.replaceChildren(new Option("All seasons", ""), ...years.map((y) => new Option(String(y), String(y))));
  filterSeason.value = years.includes(Number(keepSeason)) ? keepSeason : "";
  const names = [...new Set([...awardPresets, ...officeData.awards.map((a) => a.award)])].sort((a, b) => presetRank(a) - presetRank(b) || a.localeCompare(b));
  filterAward.replaceChildren(new Option("All awards", ""), ...names.map((name) => {
    const info = awardDetails(name);
    return new Option(info ? `${name} (${info.about || info.short})` : name, name);
  }));
  filterAward.value = names.includes(keepAward) ? keepAward : "";
}
filterSeason.addEventListener("change", renderAwards);
filterAward.addEventListener("change", renderAwards);
document.querySelector("#awards-filter-clear").addEventListener("click", () => { filterSeason.value = ""; filterAward.value = ""; renderAwards(); });

function showSeason(year) {
  viewSeason = year;
  awardsForm.elements.season.value = String(year);
  renderAwards();
}
awardsSeasonSelect.addEventListener("change", () => showSeason(Number(awardsSeasonSelect.value)));
document.querySelector("#awards-step").addEventListener("click", (event) => {
  const button = event.target.closest("[data-step]");
  if (button) showSeason(viewSeason + Number(button.dataset.step));
});
document.querySelector("#awards-jump").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#awards-jump-year");
  if (!input.reportValidity()) return;
  showSeason(Number(input.value));
  input.value = "";
});

function openForm(award, entry) {
  const f = awardsForm.elements;
  f.season.value = String(viewSeason);
  f.award.value = award;
  f.winner.value = entry?.winner || "";
  f.team.value = entry?.teamId || "";
  f.position.value = entry?.position || "";
  showStatBoxes(award);
  writeStatInputs(awardsForm, allStatKeys, entry?.line);
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
document.querySelector("#award-presets").append(...awardInfo.map(({ name, short, about }) => {
  const option = document.createElement("option");
  option.value = name;
  option.label = about || short;
  return option;
}));
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

// ---- Stat boxes ----
// Coach and GM awards record the team's season; every other award records the player's season.
const allStatKeys = [...playerStatKeys, ...recordStatKeys];
const isTeamAward = (award) => awardDetails(award)?.kind === "team";
const statKeysFor = (award) => isTeamAward(award) ? recordStatKeys : playerStatKeys;
const statFill = document.querySelector("#award-stats-fill");
let shownKind = null;

function showStatBoxes(award) {
  const kind = isTeamAward(award) ? "team" : "player";
  if (kind !== shownKind) {
    const keep = readStatInputs(awardsForm, allStatKeys);
    document.querySelector("#award-stat-inputs").replaceChildren(statInputsNode(kind === "team" ? recordStatGroups : playerStatGroups));
    writeStatInputs(awardsForm, allStatKeys, keep);
    shownKind = kind;
  }
  document.querySelector("#award-stats-legend").textContent = kind === "team" ? "Team record" : "Season stats";
  updateStatFill();
}

// What "Fill" can use: this season's standings (team awards) or logged box scores (player awards).
function fillSource() {
  const f = awardsForm.elements;
  const season = Number(f.season.value);
  if (shownKind === "team") {
    const record = f.team.value && officeData.standings?.season === season ? officeData.standings.teams?.[f.team.value] : null;
    return record ? { label: `Fill from ${season} standings`, values: Object.fromEntries(recordStatKeys.filter((k) => record[k] !== undefined).map((k) => [k, record[k]])) } : null;
  }
  if (season !== thisSeason() || !f.winner.value.trim()) return null;
  const found = seasonBoxScoreStats(officeData, f.winner.value);
  return found ? { label: `Fill from ${found.games} box score${found.games === 1 ? "" : "s"}`, values: found.values } : null;
}

function updateStatFill() {
  const source = canSave ? fillSource() : null;
  statFill.hidden = !source;
  if (source) statFill.textContent = source.label;
}

statFill.addEventListener("click", () => {
  const source = fillSource();
  if (!source) return;
  writeStatInputs(awardsForm, allStatKeys, source.values);
  awardsStatus.textContent = shownKind === "team" ? "Record filled from the standings." : "Season totals filled from the logged box scores. Check them against your league's stats.";
});
awardsForm.elements.award.addEventListener("input", () => showStatBoxes(awardsForm.elements.award.value.trim()));
for (const name of ["winner", "team", "season"]) {
  awardsForm.elements[name].addEventListener("input", updateStatFill);
  awardsForm.elements[name].addEventListener("change", updateStatFill);
}

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
  const position = f.position.value.trim();
  if (position) entry.position = position.slice(0, awardTextLimits.position); else delete entry.position;
  const line = readStatInputs(awardsForm, statKeysFor(award));
  if (line) { entry.line = line; delete entry.notes; } else delete entry.line;
  if (!existing) officeData.awards.push(entry);
  viewSeason = season;
  save(`${entry.winner} named the ${season} ${entry.award}.`);
  awardsForm.reset();
  f.season.value = String(viewSeason);
  showStatBoxes("");
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
showStatBoxes("");
renderAwards();
