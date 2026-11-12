// Player profile page: player.html?id=<player id>. Works for salary-sheet players
// and players added on Player Contracts. Data model lives in league-core.js.
const playerId = new URLSearchParams(window.location.search).get("id") || "";
const heroEl = document.querySelector("#player-hero");
const statusEl = document.querySelector("#player-status");
const bioForm = document.querySelector("#player-bio");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch {
  canSave = false;
}

function located() {
  return findPlayerById(officeData, playerId);
}

function save(message) {
  try {
    writeStoredOffice(officeData);
    statusEl.textContent = message;
  } catch (error) {
    statusEl.textContent = `Could not save: ${error.message}.`;
  }
}

const lastFirst = (name) => {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return name;
  // Keep suffixes with the last name: "Odell Beckham Jr." → "Beckham Jr., Odell".
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[parts.length - 1]) ? ` ${parts.pop()}` : "";
  const last = parts.pop();
  return `${last}${suffix}, ${parts.join(" ")}`;
};
const firstLast = (text) => {
  const [last, first] = String(text).split(",").map((part) => part.trim());
  return first ? `${first} ${last}` : String(text).trim();
};
const initials = (name) => String(name).split(/\s+/).filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();

// Draft prospects: the pool's college, the combine's height and weight, and the pick that took them fill any
// blanks in the profile (what's typed into the bio form wins).
function combineFor(entry) {
  return combineResultsFor(officeData, entry.player.name, entry.source === "prospect" ? entry.player.year : (playerProfile(entry.player).draftYear || null));
}
function shownProfile(entry) {
  const profile = playerProfile(entry.player);
  if (entry.source !== "prospect") return profile;
  const c = combineFor(entry);
  const shown = { ...profile };
  if (!shown.positions && entry.player.position) shown.positions = entry.player.position;
  if (!shown.college && entry.player.college) shown.college = entry.player.college;
  if (!shown.height && c?.ht) shown.height = c.ht;
  if (!shown.weight && c?.wt && isIntegerInRange(Number(c.wt), 100, 500)) shown.weight = Number(c.wt);
  if (!shown.draftYear && entry.pick) { shown.draftYear = entry.pick.year; shown.draftRound = entry.pick.round; shown.draftPick = entry.pick.pick; }
  return shown;
}

function currentPosition(entry) {
  if (entry.source === "sheet") return playerDisplayPosition(entry.player);
  return entry.player.position || "";
}

function nflRecordFor(entry) {
  const match = matchNflExperience(entry.player.name, currentPosition(entry), entry.teamId && entry.teamId !== freeAgentTeamId ? entry.teamId : null);
  return match.record || null;
}

function teamLabel(teamId) {
  if (!teamId) return "No team";
  if (teamId === freeAgentTeamId) return "Free agent";
  return teamName(teamId);
}

// ---------- header ----------
function renderHero(entry) {
  heroEl.replaceChildren();
  const { player, teamId } = entry;
  const profile = shownProfile(entry);
  const avatar = document.createElement("div");
  avatar.className = "player-avatar";
  const fallback = () => {
    avatar.replaceChildren();
    avatar.textContent = initials(player.name);
  };
  if (profilePhotoSrc(profile)) {
    const img = document.createElement("img");
    img.src = profilePhotoSrc(profile);
    img.alt = `${player.name}`;
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", fallback, { once: true });
    avatar.append(img);
  } else {
    fallback();
  }

  const text = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.innerHTML = '<span class="eyebrow-dot"></span> ';
  eyebrow.append(entry.source === "prospect" ? (entry.pick ? "DRAFT PROSPECT · DRAFTED" : "DRAFT PROSPECT") : `PLAYER PROFILE${profile.retired ? " · RETIRED" : ""}`);
  const name = document.createElement("h1");
  name.textContent = player.name;
  const facts = document.createElement("p");
  facts.className = "player-facts";
  const age = playerAge(player);
  const position = profile.positions || currentPosition(entry);
  const bits = [
    position,
    age !== null ? `Age ${age}` : "",
    player.experience != null ? (player.experience === 0 ? "Rookie" : `${player.experience} accrued ${player.experience === 1 ? "season" : "seasons"}`) : "",
    profile.height, profile.weight ? `${profile.weight} lbs` : "", profile.college
  ].filter(Boolean);
  facts.textContent = bits.join(" · ");
  const team = document.createElement("p");
  team.className = "player-team-line";
  if (teamId && teamId !== freeAgentTeamId) {
    const link = document.createElement("a");
    link.href = `team.html?team=${encodeURIComponent(teamId)}`;
    link.textContent = teamName(teamId);
    team.append(link);
  } else {
    team.textContent = teamLabel(teamId);
  }
  if (entry.source === "prospect" && !entry.pick) {
    team.textContent = `${player.year} draft prospect${player.rank ? ` · Ranked No. ${player.rank} in the Draft Pool` : ""}`;
  } else if (entry.source === "prospect") {
    team.append(` · Drafted ${entry.pick.year}, round ${entry.pick.round}, pick ${entry.pick.pick}${entry.pick.compensatory ? "*" : ""}`);
  } else if (profile.draftYear) {
    team.append(` · Drafted ${profile.draftYear}${profile.draftRound ? `, round ${profile.draftRound}` : ""}${profile.draftPick ? `, pick ${profile.draftPick}` : ""}`);
  } else if (profile.college || bits.length > 2) {
    // nothing to add
  }
  text.append(eyebrow, name, team, facts);
  const injury = injuryForPlayer(officeData, player, teamId);
  if (injury) {
    const tag = document.createElement("a");
    tag.className = `player-injury${injury.ir ? " is-ir" : ""}`;
    tag.href = "injuries.html";
    const status = document.createElement("strong");
    status.textContent = injury.ir ? "Injured Reserve" : "Injured";
    tag.append(status, [injury.injury, injury.duration].filter(Boolean).map((bit) => ` · ${bit}`).join(""));
    text.append(tag);
  }
  heroEl.append(avatar, text);
  document.title = `${player.name} — Nothing But NFL`;
}

// ---------- bio form ----------
function fillBioForm(entry) {
  const { player } = entry;
  const profile = shownProfile(entry);
  const f = bioForm.elements;
  f.name.value = lastFirst(player.name);
  f.positions.value = profile.positions;
  f.positions.placeholder = currentPosition(entry) ? `${currentPosition(entry)} (from ${entry.source === "sheet" ? "the salary sheet" : entry.source === "prospect" ? "the Draft Pool" : "Player Contracts"})` : "e.g. QB or CB / S";
  f.birthDate.value = player.birthDate || "";
  f.college.value = profile.college;
  f.draftYear.value = profile.draftYear ?? "";
  f.draftRound.value = profile.draftRound ?? "";
  f.draftPick.value = profile.draftPick ?? "";
  f.height.value = profile.height;
  f.weight.value = profile.weight ?? "";
  f.photoUrl.value = profile.photoUrl;
  document.querySelector("#photo-remove").hidden = !profile.photoData;
  f.retired.checked = profile.retired;
  f.notes.value = profile.notes;
  for (const element of bioForm.elements) element.disabled = !canSave;
}

bioForm.addEventListener("change", (event) => {
  const entry = located();
  if (!entry || !canSave) return;
  const input = event.target;
  const { player } = entry;
  const profile = playerProfile(player);
  const value = input.type === "checkbox" ? input.checked : input.value.trim();
  const fail = (message) => {
    input.setCustomValidity(message);
    input.reportValidity();
    input.setCustomValidity("");
    fillBioForm(entry);
  };
  switch (input.name) {
    case "name": {
      const name = firstLast(value);
      if (!name || name.length > 70) return fail("Enter the name as Last, First.");
      player.name = name;
      break;
    }
    case "birthDate":
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail("Pick a date.");
      player.birthDate = value || null;
      if (value) player.age = null;
      break;
    case "draftYear": case "draftRound": case "draftPick": case "weight": {
      const ranges = { draftYear: [1936, 2100], draftRound: [1, 20], draftPick: [1, 400], weight: [100, 500] };
      const number = value === "" ? null : Number(value);
      if (number !== null && !isIntegerInRange(number, ...ranges[input.name])) return fail(`Enter a whole number from ${ranges[input.name][0]} to ${ranges[input.name][1]}, or leave it blank.`);
      profile[input.name] = number;
      break;
    }
    case "height":
      if (value && !/^\d'\s?\d{1,2}"?$/.test(value)) return fail(`Enter a height like 6'2".`);
      profile.height = value ? value.replace(/\s/g, "").replace(/"?$/, '"') : "";
      break;
    case "photoUrl":
      if (value && !/^https?:\/\//i.test(value)) return fail("Enter a full image link starting with https://");
      profile.photoUrl = value;
      delete profile.photoSource; // set by hand: Admin › Player Headshots won't replace it unless asked
      break;
    case "retired":
      profile.retired = Boolean(value);
      break;
    case "positions": case "college": case "notes":
      profile[input.name] = value.slice(0, profileTextLimits[input.name]);
      if (entry.source === "prospect" && input.name === "college") { if (value) player.college = value.slice(0, 80); else delete player.college; }
      break;
    default:
      return;
  }
  player.profile = profile;
  save(`${player.name}'s profile saved.`);
  renderHero(entry);
  if (input.name === "name") fillBioForm(entry);
});

// ---------- uploaded photo (older saves) ----------
document.querySelector("#photo-remove").addEventListener("click", () => {
  const entry = located();
  if (!entry || !canSave) return;
  const profile = playerProfile(entry.player);
  profile.photoData = "";
  entry.player.profile = profile;
  save(`Uploaded photo removed for ${entry.player.name}.`);
  renderHero(entry);
  fillBioForm(entry);
});

document.querySelector("#player-fill").addEventListener("click", () => {
  const entry = located();
  if (!entry || !canSave) return;
  if (typeof nflExperienceSnapshot === "undefined") {
    statusEl.textContent = "NFL roster data could not be loaded.";
    return;
  }
  const record = entry.source === "prospect" ? null : nflRecordFor(entry);
  if (!record) {
    statusEl.textContent = `No NFL roster match for ${entry.player.name}, so nothing was filled. Enter the bio by hand.`;
    return;
  }
  const { player } = entry;
  const profile = playerProfile(player);
  const filled = [];
  if (!player.birthDate && record.birthDate) { player.birthDate = record.birthDate; player.age = null; filled.push("date of birth"); }
  if (!profile.college && record.college) { profile.college = record.college; filled.push("college"); }
  if (!profile.height && record.height) { profile.height = formatHeight(record.height); filled.push("height"); }
  if (!profile.weight && record.weight) { profile.weight = record.weight; filled.push("weight"); }
  if (!profile.draftYear && record.draftYear) {
    profile.draftYear = record.draftYear;
    profile.draftRound = record.draftRound || null;
    profile.draftPick = record.draftPick || null;
    filled.push("draft year, round and pick");
  }
  if (player.experience == null && record.experience != null) { player.experience = record.experience; filled.push("experience"); }
  player.profile = profile;
  save(filled.length
    ? `Filled ${filled.join(", ")} from NFL roster data (${record.fullName}, ${record.team}). Fields you'd already entered were kept.`
    : "Every field NFL data covers is already filled in; nothing was changed.");
  render();
});

// ---------- contract ----------
function renderContract(entry) {
  const box = document.querySelector("#player-contract");
  box.replaceChildren();
  const { player } = entry;
  const contract = playerContract(player);
  const aav = contractAav(contract);
  const money = (value) => (value === null || value === undefined ? "—" : formatCurrency(value));
  const summary = document.createElement("dl");
  summary.className = "player-contract-summary";
  for (const [label, value] of [
    ["FA type", player.faType || "—"], ["Length", contract.length ? `${contract.length} ${contract.length === 1 ? "year" : "years"}` : "—"],
    ["Total value", money(contract.totalValue)], ["Signing bonus", money(contract.signingBonus)],
    ["Guaranteed", money(contract.guaranteed)], ["AAV", money(aav)]
  ]) {
    const item = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    item.append(dt, dd);
    summary.append(item);
  }
  if (entry.source === "prospect") {
    const note = document.createElement("p");
    note.className = "empty-state";
    note.textContent = entry.pick
      ? `Drafted by the ${teamName(entry.pick.teamId)}. His contract shows here once he's added to their salary sheet or Player Contracts.`
      : "A draft prospect: no contract yet.";
    box.append(note);
    return;
  }
  box.append(summary);
  if (entry.source !== "sheet") {
    const note = document.createElement("p");
    note.className = "empty-state";
    note.textContent = "Cap hits appear once this player is on his team's salary sheet.";
    box.append(note);
    return;
  }
  const table = document.createElement("table");
  table.className = "management-table player-cap-table";
  const head = table.createTHead().insertRow();
  const body = table.createTBody().insertRow();
  for (const year of seasons) {
    const th = document.createElement("th");
    th.textContent = String(year);
    head.append(th);
    body.insertCell().textContent = isPlayerOnSeason(player, year) ? formatCurrency(capHitFor(seasonEntry(player, year))) : "—";
  }
  const wrap = document.createElement("div");
  wrap.className = "management-table-wrap";
  const caption = document.createElement("h4");
  caption.className = "player-subhead";
  caption.textContent = "Cap hits";
  wrap.append(table);
  box.append(caption, wrap);
}

// ---------- combine ----------
function renderCombine(entry) {
  const box = document.querySelector("#player-combine");
  box.replaceChildren();
  const c = combineFor(entry);
  const note = document.querySelector("#player-combine-note");
  if (!c) {
    note.textContent = "From the NFL Scouting Combine.";
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = entry.source === "prospect"
      ? "No combine results on file for this prospect. Add them under Season Information › Draft › Draft setup › Combine results."
      : "No combine results on file for this player.";
    box.append(empty);
    return;
  }
  note.textContent = `${c.year} NFL Scouting Combine · ${c.source || "entered under Draft setup"}`;
  const grid = document.createElement("dl");
  grid.className = "player-combine-grid";
  for (const key of Object.keys(combineLabels)) {
    const item = document.createElement("div");
    if (!c[key]) item.className = "is-empty";
    const dt = document.createElement("dt");
    dt.textContent = combineLabels[key];
    const dd = document.createElement("dd");
    dd.textContent = c[key] ? `${c[key]}${key === "wt" && /^\d+$/.test(c[key]) ? " lbs" : key === "bench" && /^\d+$/.test(c[key]) ? " reps" : /^(forty|cone|shuttle)$/.test(key) && /^\d+(\.\d+)?$/.test(c[key]) ? " s" : ""}` : "—";
    item.append(dt, dd);
    if (c[key] || !["arm", "hand"].includes(key)) grid.append(item);
  }
  box.append(grid);
}

// ---------- stats ----------
function rowsForPlayer(table, player, teamId) {
  const nameIndex = statNameColumn(table);
  const teamIndex = statTeamColumn(table);
  const key = normalizePlayerName(player.name);
  return table.rows.filter((row) => normalizePlayerName(row[nameIndex] || "") === key &&
    (teamIndex === -1 || !teamId || teamId === freeAgentTeamId || !lookupTeamId(row[teamIndex] || "") || lookupTeamId(row[teamIndex] || "") === teamId ||
      // A player traded mid-season can have rows for other teams too; keep them when the name is unique.
      !table.rows.some((other) => other !== row && normalizePlayerName(other[nameIndex] || "") === key && lookupTeamId(other[teamIndex] || "") === teamId)));
}

function renderStatsPanel(entry) {
  const box = document.querySelector("#player-stats");
  box.replaceChildren();
  let found = 0;
  for (const key of ["passing", "rushing", "receiving", "defense", "kicking"]) {
    const table = statTableFor(officeData, key);
    if (!table) continue;
    const rows = rowsForPlayer(table, entry.player, entry.teamId);
    if (!rows.length) continue;
    found += 1;
    const heading = document.createElement("h4");
    heading.className = "player-subhead";
    heading.textContent = statCategories[key];
    const t = document.createElement("table");
    t.className = "management-table player-stat-table";
    const headRow = t.createTHead().insertRow();
    const nameIndex = statNameColumn(table);
    table.headers.forEach((header, index) => {
      if (index === nameIndex) return;
      const th = document.createElement("th");
      th.textContent = header;
      headRow.append(th);
    });
    const tbody = t.createTBody();
    for (const row of rows) {
      const tr = tbody.insertRow();
      table.headers.forEach((_, index) => {
        if (index === nameIndex) return;
        tr.insertCell().textContent = row[index] ?? "";
      });
    }
    const wrap = document.createElement("div");
    wrap.className = "management-table-wrap";
    wrap.append(t);
    box.append(heading, wrap);
  }
  if (!found) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No stats for this player yet.";
    box.append(empty);
  }
}

// ---------- game log ----------
function renderGames(entry) {
  const box = document.querySelector("#player-games");
  box.replaceChildren();
  const key = normalizePlayerName(entry.player.name);
  const games = (officeData.games || []).filter((game) =>
    Object.values(game.players || {}).some((lines) => lines.some((line) => normalizePlayerName(line.player) === key)))
    .sort((a, b) => (b.week ?? -1) - (a.week ?? -1) || b.date.localeCompare(a.date));
  if (!games.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No box scores with this player yet.";
    box.append(empty);
    return;
  }
  const summaries = {
    passing: (l) => `${l.cmp ?? 0}/${l.att ?? 0}, ${l.yds ?? 0} yds, ${l.td ?? 0} TD, ${l.int ?? 0} INT`,
    rushing: (l) => `${l.att ?? 0} car, ${l.yds ?? 0} yds, ${l.td ?? 0} TD`,
    receiving: (l) => `${l.rec ?? 0} rec, ${l.yds ?? 0} yds, ${l.td ?? 0} TD`,
    defense: (l) => [l.tackles ? `${l.tackles} tkl` : "", l.sacks ? `${l.sacks} sk` : "", l.int ? `${l.int} INT` : "", l.ff ? `${l.ff} FF` : "", l.pd ? `${l.pd} PD` : ""].filter(Boolean).join(", ") || "0 tkl",
    kicking: (l) => `${l.fgm ?? 0}/${l.fga ?? 0} FG, ${l.xpm ?? 0}/${l.xpa ?? 0} XP`
  };
  const table = document.createElement("table");
  table.className = "management-table player-game-table";
  const head = table.createTHead().insertRow();
  for (const label of ["WEEK", "DATE", "OPPONENT", "RESULT", "STAT LINE"]) {
    const th = document.createElement("th");
    th.textContent = label;
    head.append(th);
  }
  const body = table.createTBody();
  for (const game of games) {
    const lines = Object.entries(game.players).flatMap(([category, list]) =>
      list.filter((line) => normalizePlayerName(line.player) === key).map((line) => ({ category, line })));
    const team = lines[0]?.line.team;
    const mine = game.teams.find((side) => side.team === team) || game.teams[0];
    const theirs = game.teams.find((side) => side !== mine);
    const row = body.insertRow();
    row.insertCell().textContent = game.week ?? "—";
    row.insertCell().textContent = game.date;
    row.insertCell().textContent = theirs.team;
    row.insertCell().textContent = `${mine.score > theirs.score ? "W" : mine.score < theirs.score ? "L" : "T"} ${mine.score}-${theirs.score}`;
    row.insertCell().textContent = lines.map(({ category, line }) => summaries[category](line)).join(" · ");
  }
  const wrap = document.createElement("div");
  wrap.className = "management-table-wrap";
  wrap.append(table);
  box.append(wrap);
}

// ---------- transactions ----------
function renderTransactions(entry) {
  const box = document.querySelector("#player-transactions");
  box.replaceChildren();
  const key = normalizePlayerName(entry.player.name);
  const mentions = (text) => normalizePlayerName(text || "").includes(key);
  const list = (officeData.transactions || []).filter((t) =>
    mentions(t.player) || mentions(t.details) || (t.sides || []).some((side) => side.items.some(mentions)))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No transactions for this player in the log.";
    box.append(empty);
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "player-transactions";
  for (const t of list) {
    const li = document.createElement("li");
    const badge = document.createElement("span");
    badge.className = `txn-badge txn-${t.type}`;
    badge.textContent = transactionTypes[t.type];
    const date = document.createElement("small");
    date.textContent = t.date;
    const text = document.createElement("span");
    text.textContent = t.type === "trade" && t.tradeNumber ? `Trade ${t.tradeNumber}: ${t.teams.join(" ⇄ ")}` : (t.details || t.player || "");
    li.append(badge, date, text);
    ul.append(li);
  }
  box.append(ul);
}

function render() {
  const entry = located();
  if (!entry) {
    heroEl.innerHTML = "";
    const title = document.createElement("h1");
    title.textContent = "Player not found";
    const note = document.createElement("p");
    note.className = "team-page-subtitle";
    note.textContent = "This player isn't on a salary sheet, Player Contracts or the Draft Pool in this browser. Open a profile from Player Contracts, the Season Stats page or the Draft.";
    heroEl.append(title, note);
    document.querySelector("#player-body").hidden = true;
    return;
  }
  renderHero(entry);
  fillBioForm(entry);
  renderCombine(entry);
  renderContract(entry);
  document.querySelector("#player-fill").hidden = entry.source === "prospect"; // NFL roster data has no prospects
  const back = document.querySelector(".team-back-link");
  if (entry.source === "prospect") { back.href = "draft.html"; back.lastChild.textContent = " DRAFT"; }
  renderStatsPanel(entry);
  renderGames(entry);
  renderTransactions(entry);
}

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    render();
  } catch {
    // keep the current view
  }
});

render();
