// Season Schedule. Games live in officeData.schedule (league-core.js); scores come from box scores (officeData.games).
const scheduleList = document.querySelector("#schedule-list");
const scheduleStatus = document.querySelector("#schedule-status");
const scheduleNotice = document.querySelector("#schedule-storage-notice");
const scheduleEmpty = document.querySelector("#schedule-empty");
const scheduleSeasonSelect = document.querySelector("#schedule-season");
const scheduleTeamSelect = document.querySelector("#schedule-team");
const scheduleWeeks = document.querySelector("#schedule-weeks");
const scheduleForm = document.querySelector("#schedule-form");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  scheduleNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.schedule)) officeData.schedule = [];

const leagueSeason = () => officeData.standings?.season || currentLeagueYear();
let viewSeason = leagueSeason();
let viewWeek = null;
const allWeeks = Array.from({ length: 22 }, (_, i) => i + 1);

function save(message) {
  try {
    writeStoredOffice(officeData);
    scheduleStatus.textContent = message;
  } catch (error) {
    scheduleStatus.textContent = `Could not save: ${error.message}.`;
  }
}

const formatDay = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

// Scheduled games plus any box scores that aren't on the schedule (so played games always show).
function seasonGames() {
  const scheduled = officeData.schedule.filter((g) => g.season === viewSeason).map((g) => ({ ...g, result: resultForScheduled(officeData, g) }));
  const used = new Set(scheduled.map((g) => g.result?.id).filter(Boolean));
  const extra = (officeData.games || [])
    .filter((played) => !used.has(played.id) && Number.isInteger(played.week) && played.week >= 1 && played.week <= 22 &&
      (!officeData.standings?.season || viewSeason === leagueSeason()))
    .map((played) => ({ id: `played-${played.id}`, fromBoxScore: true, season: viewSeason, week: played.week, away: played.teams[0].team, home: played.teams[1].team, date: played.date, result: played }));
  return [...scheduled, ...extra];
}

function defaultWeek(games) {
  // The first week that still has unplayed games, else the last week with games.
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
  return weeks.find((w) => games.some((g) => g.week === w && !g.result)) ?? weeks[weeks.length - 1] ?? 1;
}

function fillSelectors() {
  const years = [...new Set([leagueSeason(), ...officeData.schedule.map((g) => g.season)])].sort((a, b) => b - a);
  scheduleSeasonSelect.replaceChildren(...years.map((y) => new Option(String(y), String(y))));
  if (!years.includes(viewSeason)) viewSeason = years[0];
  scheduleSeasonSelect.value = String(viewSeason);
  if (!scheduleTeamSelect.options.length) {
    scheduleTeamSelect.append(new Option("All teams (one week)", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  }
}

function scoreLine(game) {
  const r = game.result;
  const score = (team) => r.teams.find((t) => t.team === team)?.score ?? 0;
  return { away: score(game.away), home: score(game.home) };
}

function teamSide(teamId, score, isWinner, result) {
  const side = document.createElement("span");
  side.className = `sched-team${isWinner ? " is-winner" : ""}${result && !isWinner ? " is-loser" : ""}`;
  const link = document.createElement("a");
  link.href = `team.html?team=${encodeURIComponent(teamId)}`;
  const code = document.createElement("b");
  code.textContent = teamId;
  const name = document.createElement("span");
  name.className = "sched-team-name";
  name.textContent = teamName(teamId);
  link.append(code, name);
  side.append(link);
  if (result) {
    const s = document.createElement("strong");
    s.className = "sched-score";
    s.textContent = String(score);
    side.append(s);
  }
  return side;
}

function gameRow(game, focusTeam) {
  const row = document.createElement("article");
  row.className = `sched-game${game.result ? " is-final" : ""}`;
  row.dataset.gameId = game.id;
  const when = document.createElement("div");
  when.className = "sched-when";
  if (focusTeam) {
    const wk = document.createElement("strong");
    wk.textContent = scheduleWeekName(game.week);
    when.append(wk);
  }
  const day = document.createElement("span");
  day.textContent = [game.date ? formatDay(game.date) : "", game.time || ""].filter(Boolean).join(" · ") || "TBD";
  when.append(day);
  const matchup = document.createElement("div");
  matchup.className = "sched-matchup";
  const score = game.result ? scoreLine(game) : null;
  matchup.append(
    teamSide(game.away, score?.away, score && score.away > score.home, Boolean(score)),
    Object.assign(document.createElement("span"), { className: "sched-at", textContent: "@" }),
    teamSide(game.home, score?.home, score && score.home > score.away, Boolean(score))
  );
  const status = document.createElement("div");
  status.className = "sched-status";
  if (focusTeam && score) {
    const mine = focusTeam === game.away ? score.away : score.home;
    const theirs = focusTeam === game.away ? score.home : score.away;
    const tag = document.createElement("span");
    tag.className = `sched-result ${mine > theirs ? "is-w" : mine < theirs ? "is-l" : "is-t"}`;
    tag.textContent = `${mine > theirs ? "W" : mine < theirs ? "L" : "T"} ${mine}–${theirs}`;
    status.append(tag);
  } else {
    const tag = document.createElement("span");
    tag.className = "sched-state";
    tag.textContent = game.result ? "Final" : "Scheduled";
    status.append(tag);
  }
  if (game.note) {
    const note = document.createElement("small");
    note.textContent = game.note;
    status.append(note);
  }
  if (canSave && !game.fromBoxScore) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-delete";
    remove.dataset.action = "remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${game.away} at ${game.home} from the schedule`);
    status.append(remove);
  }
  row.append(when, matchup, status);
  return row;
}

function renderSchedule() {
  fillSelectors();
  document.querySelector("#schedule-season-label").textContent = String(viewSeason);
  const games = seasonGames();
  const team = scheduleTeamSelect.value;
  const record = document.querySelector("#schedule-record");
  scheduleWeeks.hidden = Boolean(team);
  if (team) {
    const mine = games.filter((g) => g.away === team || g.home === team).sort((a, b) => a.week - b.week || String(a.date || "").localeCompare(String(b.date || "")));
    let w = 0, l = 0, t = 0;
    for (const g of mine) {
      if (!g.result) continue;
      const s = scoreLine(g);
      const a = team === g.away ? s.away : s.home, b = team === g.away ? s.home : s.away;
      if (a > b) w += 1; else if (a < b) l += 1; else t += 1;
    }
    record.hidden = false;
    record.textContent = `${teamName(team)} · ${w}-${l}${t ? `-${t}` : ""} in ${w + l + t} played · ${mine.length - (w + l + t)} to go`;
    scheduleList.replaceChildren(...mine.map((g) => gameRow(g, team)));
    scheduleEmpty.hidden = mine.length > 0;
    scheduleEmpty.textContent = `No ${viewSeason} games for the ${teamName(team)} yet. Add them below.`;
    return;
  }
  record.hidden = true;
  const weeksWithGames = new Set(games.map((g) => g.week));
  if (viewWeek === null || (!weeksWithGames.has(viewWeek) && weeksWithGames.size && viewWeek > 18)) viewWeek = defaultWeek(games);
  const shownWeeks = allWeeks.filter((w) => w <= 18 || weeksWithGames.has(w));
  scheduleWeeks.replaceChildren(...shownWeeks.map((w) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `tab-button${w === viewWeek ? " is-active" : ""}${weeksWithGames.has(w) ? "" : " is-empty"}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(w === viewWeek));
    tab.dataset.week = String(w);
    tab.textContent = w <= 18 ? String(w) : scheduleWeekName(w);
    tab.title = scheduleWeekName(w);
    return tab;
  }));
  const week = games.filter((g) => g.week === viewWeek).sort((a, b) => String(a.date || "9").localeCompare(String(b.date || "9")) || String(a.time || "").localeCompare(String(b.time || "")) || a.home.localeCompare(b.home));
  const heading = document.createElement("h3");
  heading.className = "sched-week-title";
  const played = week.filter((g) => g.result).length;
  heading.textContent = `${scheduleWeekName(viewWeek)}${week.length ? ` · ${played} of ${week.length} final` : ""}`;
  scheduleList.replaceChildren(heading, ...week.map((g) => gameRow(g, "")));
  scheduleEmpty.hidden = week.length > 0;
  scheduleEmpty.textContent = `No games scheduled for ${scheduleWeekName(viewWeek)} yet. Add them below, or paste the week from a spreadsheet.`;
}

scheduleSeasonSelect.addEventListener("change", () => { viewSeason = Number(scheduleSeasonSelect.value); viewWeek = null; renderSchedule(); });
scheduleTeamSelect.addEventListener("change", renderSchedule);
scheduleWeeks.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-week]");
  if (!tab) return;
  viewWeek = Number(tab.dataset.week);
  scheduleForm.elements.week.value = String(viewWeek);
  renderSchedule();
});

scheduleList.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="remove"]');
  const row = button?.closest("[data-game-id]");
  const game = row && officeData.schedule.find(({ id }) => id === row.dataset.gameId);
  if (!game || !canSave) return;
  const ok = await confirmAction(`Remove ${teamName(game.away)} at ${teamName(game.home)} (${scheduleWeekName(game.week)}) from the schedule? Box scores and standings aren't changed.`, { confirmLabel: "Remove game", danger: true });
  if (!ok) return;
  officeData.schedule = officeData.schedule.filter(({ id }) => id !== game.id);
  save(`${game.away} at ${game.home} removed from ${scheduleWeekName(game.week)}.`);
  renderSchedule();
});

// ---- Adding games ----
const teamOptions = () => [new Option("Choose a team", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id))];
scheduleForm.elements.away.append(...teamOptions());
scheduleForm.elements.home.append(...teamOptions());
scheduleForm.elements.week.append(...allWeeks.map((w) => new Option(scheduleWeekName(w), String(w))));

function upsertGame(fields) {
  const existing = officeData.schedule.find((g) => g.season === fields.season && g.week === fields.week &&
    ((g.away === fields.away && g.home === fields.home) || (g.away === fields.home && g.home === fields.away)));
  const busy = officeData.schedule.find((g) => g !== existing && g.season === fields.season && g.week === fields.week &&
    [g.away, g.home].some((t) => t === fields.away || t === fields.home));
  const game = existing || { id: newRecordId("sched"), season: fields.season, week: fields.week };
  game.away = fields.away;
  game.home = fields.home;
  for (const field of ["date", "time", "note"]) {
    if (fields[field]) game[field] = fields[field]; else if (!existing) delete game[field];
  }
  if (!existing) officeData.schedule.push(game);
  return { game, updated: Boolean(existing), busy };
}

scheduleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !scheduleForm.reportValidity()) return;
  const f = scheduleForm.elements;
  if (f.away.value === f.home.value) { scheduleStatus.textContent = "Pick two different teams."; return; }
  if (officeData.schedule.length >= 3000) { scheduleStatus.textContent = "The schedule has reached its 3,000-game limit."; return; }
  const { game, updated, busy } = upsertGame({ season: Number(f.season.value), week: Number(f.week.value), away: f.away.value, home: f.home.value,
    date: f.date.value, time: f.time.value.trim().slice(0, 20), note: f.note.value.trim().slice(0, 80) });
  viewSeason = game.season;
  viewWeek = game.week;
  scheduleTeamSelect.value = "";
  save(`${updated ? "Updated" : "Added"} ${game.away} at ${game.home}, ${scheduleWeekName(game.week)}.${busy ? ` ${busy.away} at ${busy.home} is also scheduled that week.` : ""}`);
  for (const name of ["away", "home", "time", "note"]) f[name].value = "";
  renderSchedule();
  f.away.focus();
});

// ---- Paste import ----
function schedField(header) {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (["week", "wk", "round"].includes(h)) return "week";
  if (["away", "awayteam", "visitor", "visitors", "road"].includes(h)) return "away";
  if (["home", "hometeam"].includes(h)) return "home";
  if (["date", "day", "gamedate"].includes(h)) return "date";
  if (["time", "kickoff", "kick", "start"].includes(h)) return "time";
  if (["note", "notes", "network", "tv", "location"].includes(h)) return "note";
  return null;
}

function weekFromText(text) {
  const t = text.trim().toLowerCase();
  const n = Number(t.replace(/^week\s*/, ""));
  if (Number.isInteger(n) && n >= 1 && n <= 22) return n;
  if (/wild/.test(t)) return 19;
  if (/divisional/.test(t)) return 20;
  if (/conf|championship/.test(t)) return 21;
  if (/super/.test(t)) return 22;
  return null;
}

function dateFromText(text) {
  const value = text.trim();
  if (!value) return "";
  let m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return localDateString(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const year = m[3] ? (Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])) : (Number(m[1]) <= 2 ? viewSeason + 1 : viewSeason);
    return localDateString(new Date(year, Number(m[1]) - 1, Number(m[2])));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : localDateString(parsed);
}

document.querySelector("#schedule-paste-import").addEventListener("click", () => {
  if (!canSave) return;
  const lines = document.querySelector("#schedule-paste-input").value.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const headerIndex = lines.findIndex((line) => { const f = line.split("\t").map(schedField); return f.includes("away") && f.includes("home"); });
  if (headerIndex === -1) { scheduleStatus.textContent = "Couldn't find a header row with Away and Home columns. Include your header row when you copy. No changes were made."; return; }
  const columns = new Map();
  lines[headerIndex].split("\t").forEach((cell, i) => { const f = schedField(cell); if (f && !columns.has(f)) columns.set(f, i); });
  const season = Number(scheduleForm.elements.season.value) || viewSeason;
  let added = 0, updated = 0;
  const problems = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const cells = lines[i].split("\t");
    const cell = (f) => (columns.has(f) ? (cells[columns.get(f)] ?? "").trim() : "");
    if (cells.every((c) => !c.trim())) continue;
    const row = `row ${i + 1}`;
    const week = columns.has("week") ? weekFromText(cell("week")) : viewWeek;
    if (!week) { problems.push(`${row}: week "${cell("week")}"`); continue; }
    const away = lookupTeamId(cell("away").replace(/^@\s*/, "")), home = lookupTeamId(cell("home").replace(/^@\s*/, ""));
    if (!away || !home || away === home) { problems.push(`${row}: teams "${cell("away")}" / "${cell("home")}"`); continue; }
    const date = dateFromText(cell("date"));
    if (date === null) { problems.push(`${row}: date "${cell("date")}"`); continue; }
    if (officeData.schedule.length >= 3000) { problems.push(`${row}: the schedule is full`); continue; }
    const result = upsertGame({ season, week, away, home, date, time: cell("time").slice(0, 20), note: cell("note").slice(0, 80) });
    if (result.updated) updated += 1; else added += 1;
  }
  const parts = [`Added ${added} and updated ${updated} ${added + updated === 1 ? "game" : "games"} for ${season}.`];
  if (problems.length) parts.push(`Skipped ${problems.length} ${problems.length === 1 ? "row" : "rows"}: ${problems.slice(0, 10).join("; ")}${problems.length > 10 ? "; …" : ""}.`);
  if (added + updated) {
    document.querySelector("#schedule-paste-input").value = "";
    viewSeason = season;
    save(parts.join(" "));
  } else {
    scheduleStatus.textContent = parts.join(" ");
  }
  renderSchedule();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.schedule)) officeData.schedule = [];
    renderSchedule();
  } catch {
    scheduleStatus.textContent = "An update from another tab could not be read.";
  }
});

if (!canSave) document.querySelector("#schedule-editor").hidden = true;
scheduleForm.elements.season.value = String(viewSeason);
renderSchedule();
scheduleForm.elements.week.value = String(viewWeek || 1);
