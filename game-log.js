// Game Log Archives: every game on record (league-core.js archivedGames), filterable and sortable.
const glRows = document.querySelector("#gl-rows");
const glStatus = document.querySelector("#gl-status");
const glNotice = document.querySelector("#gl-storage-notice");
const glSeason = document.querySelector("#gl-season");
const glWeek = document.querySelector("#gl-week");
const glTeam = document.querySelector("#gl-team");
const glForm = document.querySelector("#gl-form");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  glNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.gameArchive)) officeData.gameArchive = [];

let sort = { key: "season", direction: -1 };
const weeks = Array.from({ length: 22 }, (_, i) => i + 1);
const weekLabel = (week) => week ? scheduleWeekName(week) : "—";

function save(message) {
  try {
    writeStoredOffice(officeData);
    glStatus.textContent = message;
    return true;
  } catch (error) {
    glStatus.textContent = `Could not save: ${error.message}.`;
    return false;
  }
}

function formatDay(date) {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fillFilters(games) {
  const keep = [glSeason.value, glWeek.value, glTeam.value];
  const years = [...new Set(games.map((g) => g.season))].sort((a, b) => b - a);
  glSeason.replaceChildren(new Option("All seasons", ""), ...years.map((y) => new Option(String(y), String(y))));
  glSeason.value = years.includes(Number(keep[0])) ? keep[0] : "";
  glWeek.replaceChildren(new Option("All weeks", ""), new Option("Regular season", "regular"), new Option("Playoffs", "playoffs"),
    ...weeks.map((w) => new Option(weekLabel(w), String(w))));
  glWeek.value = keep[1];
  glTeam.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  glTeam.value = keep[2];
}

function teamCell(teamId, score, won) {
  const wrap = document.createElement("span");
  wrap.className = `gl-team${won ? " is-winner" : ""}`;
  const link = document.createElement("a");
  link.href = `team.html?team=${encodeURIComponent(teamId)}`;
  const code = document.createElement("b");
  code.textContent = teamId;
  link.append(code, teamName(teamId));
  wrap.append(link);
  return wrap;
}

const columns = [
  ["season", "SEASON"], ["week", "WEEK"], ["date", "DATE"], ["away", "AWAY"], ["score", "SCORE"], ["home", "HOME"], ["result", "RESULT"], ["source", "SOURCE"]
];

function sortValue(game, key) {
  if (key === "away" || key === "home") return teamName(game[key]);
  if (key === "date") return game.date || "";
  if (key === "score") return game.awayScore + game.homeScore;
  if (key === "week") return game.week ?? 0;
  return game[key] ?? "";
}

function render() {
  const all = archivedGames(officeData);
  fillFilters(all);
  const team = glTeam.value;
  const shown = all.filter((g) => (!glSeason.value || g.season === Number(glSeason.value)) &&
    (!glWeek.value || (glWeek.value === "regular" ? g.week && g.week <= 18 : glWeek.value === "playoffs" ? g.week > 18 : g.week === Number(glWeek.value))) &&
    (!team || g.away === team || g.home === team));
  shown.sort((a, b) => {
    const av = sortValue(a, sort.key), bv = sortValue(b, sort.key);
    const primary = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sort.direction * primary || b.season - a.season || (b.week ?? 0) - (a.week ?? 0) || (b.date || "").localeCompare(a.date || "");
  });

  // Header
  const headRow = document.createElement("tr");
  for (const [key, label] of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    const resultLabel = key === "result" && team ? `${team} RESULT` : label;
    if (key === "result" || key === "source") { th.textContent = resultLabel; headRow.append(th); continue; }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cs-sort";
    button.dataset.key = key;
    button.textContent = label + (sort.key === key ? (sort.direction === 1 ? " ↑" : " ↓") : "");
    th.setAttribute("aria-sort", sort.key === key ? (sort.direction === 1 ? "ascending" : "descending") : "none");
    th.append(button);
    headRow.append(th);
  }
  const actionsTh = document.createElement("th");
  actionsTh.scope = "col";
  actionsTh.innerHTML = '<span class="sr-only">Actions</span>';
  headRow.append(actionsTh);
  document.querySelector("#gl-head").replaceChildren(headRow);

  // Rows
  glRows.replaceChildren(...shown.map((g) => {
    const tr = document.createElement("tr");
    tr.dataset.gameId = g.id;
    const awayWon = g.awayScore > g.homeScore, homeWon = g.homeScore > g.awayScore;
    tr.insertCell().textContent = String(g.season);
    const week = tr.insertCell();
    week.textContent = weekLabel(g.week);
    if (g.week > 18) week.className = "gl-playoff";
    tr.insertCell().textContent = formatDay(g.date);
    tr.insertCell().append(teamCell(g.away, g.awayScore, awayWon));
    const score = tr.insertCell();
    score.className = "gl-score";
    score.textContent = `${g.awayScore} – ${g.homeScore}`;
    tr.insertCell().append(teamCell(g.home, g.homeScore, homeWon));
    const result = tr.insertCell();
    if (team) {
      const mine = g.away === team ? g.awayScore : g.homeScore, theirs = g.away === team ? g.homeScore : g.awayScore;
      const tag = document.createElement("span");
      tag.className = `gl-result ${mine > theirs ? "is-win" : mine < theirs ? "is-loss" : "is-tie"}`;
      tag.textContent = `${mine > theirs ? "W" : mine < theirs ? "L" : "T"} ${mine}–${theirs}`;
      result.append(tag);
    } else {
      result.textContent = awayWon ? `${g.away} won` : homeWon ? `${g.home} won` : "Tie";
    }
    if (g.note) {
      const note = document.createElement("small");
      note.className = "gl-note";
      note.textContent = g.note;
      result.append(note);
    }
    const source = tr.insertCell();
    source.className = "gl-source";
    if (g.source === "boxscore") {
      const link = document.createElement("a");
      link.href = "stats.html";
      link.textContent = "Box score";
      source.append(link);
    } else source.textContent = "Archive";
    const actions = tr.insertCell();
    if (g.source === "archive" && canSave) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "row-delete";
      remove.dataset.action = "remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${g.away} at ${g.home}, ${g.season} ${weekLabel(g.week)}`);
      actions.append(remove);
    }
    return tr;
  }));
  const empty = document.querySelector("#gl-empty");
  empty.hidden = shown.length > 0;
  empty.textContent = all.length ? "No games match these filters." : "No games on record yet. Log box scores on Season Stats, or add past games below.";
  document.querySelector("#gl-clear").hidden = !(glSeason.value || glWeek.value || team);

  // Summary
  const cards = [["Games", String(shown.length)], ["Seasons", String(new Set(shown.map((g) => g.season)).size)]];
  if (team) {
    let w = 0, l = 0, t = 0, pf = 0, pa = 0;
    for (const g of shown) {
      const mine = g.away === team ? g.awayScore : g.homeScore, theirs = g.away === team ? g.homeScore : g.awayScore;
      pf += mine; pa += theirs;
      if (mine > theirs) w += 1; else if (mine < theirs) l += 1; else t += 1;
    }
    cards.push([`${team} record`, `${w}-${l}${t ? `-${t}` : ""}`], ["Points for", String(pf)], ["Points against", String(pa)]);
  } else {
    const points = shown.reduce((s, g) => s + g.awayScore + g.homeScore, 0);
    cards.push(["Points per game", shown.length ? (points / shown.length).toFixed(1) : "—"]);
  }
  document.querySelector("#gl-summary").replaceChildren(...cards.map(([label, value]) => {
    const card = document.createElement("article");
    card.className = "cap-stat";
    const l = document.createElement("span");
    l.textContent = label.toUpperCase();
    const v = document.createElement("strong");
    v.textContent = value;
    card.append(l, v);
    return card;
  }));
}

for (const select of [glSeason, glWeek, glTeam]) select.addEventListener("change", render);
document.querySelector("#gl-clear").addEventListener("click", () => { glSeason.value = ""; glWeek.value = ""; glTeam.value = ""; render(); });
document.querySelector("#gl-head").addEventListener("click", (event) => {
  const button = event.target.closest("[data-key]");
  if (!button) return;
  const key = button.dataset.key;
  sort = sort.key === key ? { key, direction: -sort.direction } : { key, direction: ["away", "home"].includes(key) ? 1 : -1 };
  render();
});

glRows.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="remove"]');
  const id = button?.closest("tr")?.dataset.gameId;
  const game = id && officeData.gameArchive.find((g) => g.id === id);
  if (!game || !canSave) return;
  const ok = await confirmAction(`Remove ${teamName(game.away)} ${game.awayScore} at ${teamName(game.home)} ${game.homeScore} (${game.season} ${weekLabel(game.week)}) from the archive?`, { confirmLabel: "Remove game", danger: true });
  if (!ok) return;
  officeData.gameArchive = officeData.gameArchive.filter((g) => g !== game);
  save("Game removed from the archive.");
  render();
});

// ---- Adding games ----
const f = glForm.elements;
f.week.append(new Option("Choose a week", ""), ...weeks.map((w) => new Option(weekLabel(w), String(w))));
for (const name of ["away", "home"]) f[name].append(new Option("Choose a team", ""), ...nflTeams.map(({ id, name: n }) => new Option(`${n} (${id})`, id)));
f.season.value = String(currentLeagueYear() - 1);

function addGame(game) {
  if (officeData.gameArchive.length >= 10000) return "The archive is full.";
  const duplicate = archivedGames(officeData).some((g) => g.season === game.season && g.week === game.week &&
    [g.away, g.home].sort().join() === [game.away, game.home].sort().join());
  if (duplicate) return "duplicate";
  officeData.gameArchive.push({ id: newRecordId("game"), ...game });
  return "";
}

glForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !glForm.reportValidity()) return;
  if (f.away.value === f.home.value) { glStatus.textContent = "The away and home teams must be different."; return; }
  const game = { season: Number(f.season.value), week: Number(f.week.value), away: f.away.value, home: f.home.value,
    awayScore: Number(f.awayScore.value), homeScore: Number(f.homeScore.value) };
  if (f.date.value) game.date = f.date.value;
  if (f.note.value.trim()) game.note = f.note.value.trim().slice(0, 80);
  const problem = addGame(game);
  if (problem === "duplicate") { glStatus.textContent = `${game.away} vs ${game.home} is already on record for ${game.season} ${weekLabel(game.week)}.`; return; }
  if (problem) { glStatus.textContent = problem; return; }
  save(`Added ${teamName(game.away)} ${game.awayScore}, ${teamName(game.home)} ${game.homeScore} (${game.season} ${weekLabel(game.week)}).`);
  const keepSeason = f.season.value, keepWeek = f.week.value;
  glForm.reset();
  f.season.value = keepSeason;
  f.week.value = keepWeek;
  f.away.focus();
  render();
});

// Paste: Season, Week, Away, Away score, Home, Home score, Date (optional).
function teamFromText(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  const aliases = { wsh: "WAS", jac: "JAX", la: "LAR", oak: "LV", sd: "LAC", stl: "LAR" };
  if (aliases[t]) return aliases[t];
  return nflTeams.find(({ id, name }) => id.toLowerCase() === t || name.toLowerCase() === t ||
    name.toLowerCase().endsWith(` ${t}`))?.id || null;
}
function weekFromText(text) {
  const t = String(text || "").trim().toLowerCase().replace(/^week\s*/, "");
  if (/^\d+$/.test(t)) { const n = Number(t); return n >= 1 && n <= 22 ? n : null; }
  if (/wild/.test(t)) return 19;
  if (/div/.test(t)) return 20;
  if (/conf|champ/.test(t)) return 21;
  if (/super|sb/.test(t)) return 22;
  return null;
}
function dateFromText(text) {
  const t = String(text || "").trim();
  if (!t) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

document.querySelector("#gl-paste-import").addEventListener("click", () => {
  if (!canSave) return;
  const lines = document.querySelector("#gl-paste").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let added = 0, duplicates = 0;
  const bad = [];
  lines.forEach((line, index) => {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim());
    if (index === 0 && /season/i.test(cells[0] || "")) return;
    const [seasonText, weekText, awayText, awayScoreText, homeText, homeScoreText, dateText] = cells;
    const season = Number(seasonText), week = weekFromText(weekText), away = teamFromText(awayText), home = teamFromText(homeText);
    const awayScore = Number(awayScoreText), homeScore = Number(homeScoreText), date = dateFromText(dateText);
    if (!isIntegerInRange(season, 1920, 2100) || !week || !away || !home || away === home ||
        !isIntegerInRange(awayScore, 0, 200) || !isIntegerInRange(homeScore, 0, 200) || date === null) { bad.push(index + 1); return; }
    const game = { season, week, away, home, awayScore, homeScore };
    if (date) game.date = date;
    const problem = addGame(game);
    if (problem === "duplicate") duplicates += 1;
    else if (problem) bad.push(index + 1);
    else added += 1;
  });
  if (!added && !duplicates && !bad.length) { glStatus.textContent = "Paste some game rows first."; return; }
  const parts = [`${added} game${added === 1 ? "" : "s"} added`];
  if (duplicates) parts.push(`${duplicates} already on record`);
  if (bad.length) parts.push(`row${bad.length === 1 ? "" : "s"} ${bad.slice(0, 10).join(", ")}${bad.length > 10 ? "…" : ""} couldn't be read`);
  if (added) { if (save(`${parts.join("; ")}.`)) document.querySelector("#gl-paste").value = bad.length ? document.querySelector("#gl-paste").value : ""; }
  else glStatus.textContent = `${parts.join("; ")}.`;
  render();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.gameArchive)) officeData.gameArchive = [];
    render();
  } catch {
    glStatus.textContent = "An update from another tab could not be read.";
  }
});

if (!canSave) for (const element of glForm.elements) element.disabled = true;
render();
