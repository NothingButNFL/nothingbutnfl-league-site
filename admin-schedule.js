// Admin: Schedule Import. Reads a season's schedule from a CSV / TSV file or pasted spreadsheet rows, previews it,
// then adds it to officeData.schedule (the same list the Schedule page, Game of the Week and game previews use).
const siSeason = document.querySelector("#si-season");
const siPaste = document.querySelector("#si-paste");
const siFile = document.querySelector("#si-file");
const siStatus = document.querySelector("#si-status");
const siNotice = document.querySelector("#si-notice");
const siPreview = document.querySelector("#si-preview");
const siRows = document.querySelector("#si-rows");
const siReplace = document.querySelector("#si-replace");
const siImport = document.querySelector("#si-import");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  siNotice.hidden = false;
  siNotice.textContent = error instanceof SyntaxError
    ? "Saved league data could not be read, so nothing can be imported. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} Nothing can be imported.`;
}
if (!Array.isArray(officeData.schedule)) officeData.schedule = [];

const SCHEDULE_LIMIT = 3000;
const leagueSeason = () => officeData.standings?.season || currentLeagueYear();
siSeason.value = leagueSeason();
let parsed = []; // preview rows: { row, week, away, home, date, time, note, problem }

// ---------- parsing ----------
function siField(header) {
  const h = String(header).toLowerCase().replace(/[^a-z]/g, "");
  if (["week", "wk", "round", "weeknumber"].includes(h)) return "week";
  if (["away", "awayteam", "visitor", "visitors", "visitingteam", "road", "roadteam"].includes(h)) return "away";
  if (["home", "hometeam"].includes(h)) return "home";
  if (["matchup", "game", "matchups", "games"].includes(h)) return "matchup";
  if (["date", "day", "gamedate"].includes(h)) return "date";
  if (["time", "kickoff", "kick", "start", "starttime", "kickofftime"].includes(h)) return "time";
  if (["note", "notes", "network", "tv", "location", "venue"].includes(h)) return "note";
  return null;
}

function siWeek(text) {
  const t = String(text).trim().toLowerCase();
  const n = Number(t.replace(/^(week|wk)\s*/, ""));
  if (Number.isInteger(n) && n >= 1 && n <= 22) return n;
  if (/wild/.test(t)) return 19;
  if (/divisional/.test(t)) return 20;
  if (/conf|championship/.test(t)) return 21;
  if (/super/.test(t)) return 22;
  return null;
}

function siDate(text, season) {
  const value = String(text).trim();
  if (!value) return "";
  let m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return localDateString(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = value.match(/^(?:[a-z]{3,9},?\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/i);
  if (m) {
    // No year: January / February belong to the next calendar year of the season.
    const year = m[3] ? (Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])) : (Number(m[1]) <= 2 ? season + 1 : season);
    return localDateString(new Date(year, Number(m[1]) - 1, Number(m[2])));
  }
  const withYear = /\d{4}/.test(value) ? value : `${value} ${season}`;
  const d = new Date(withYear.replace(/^[a-z]{3,9},?\s+(?=[a-z])/i, ""));
  if (Number.isNaN(d.getTime())) return null;
  if (!/\d{4}/.test(value) && d.getMonth() <= 1) d.setFullYear(season + 1);
  return localDateString(d);
}

// Splits text into rows of cells: tab-separated (spreadsheet paste / .tsv) or comma-separated with "quoted" cells.
function siTable(text) {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/).find((l) => l.trim()) || "";
  if (firstLine.includes("\t")) return clean.split(/\r?\n/).map((l) => l.split("\t"));
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

// "BUF @ NYJ", "Bills at Jets", "Jets vs Bills" (vs = first team at home).
function siMatchup(text) {
  const t = String(text).trim();
  let m = t.match(/^(.+?)\s*(?:@|\bat\b)\s*(.+)$/i);
  if (m) return { away: m[1], home: m[2] };
  m = t.match(/^(.+?)\s+(?:vs\.?|v\.?)\s+(.+)$/i);
  if (m) return { away: m[2], home: m[1] };
  return null;
}

// ESPN-style schedule grid (espn.com/nfl/schedulegrid): a TEAM column, then one column per week. Each cell is the
// opponent ("SEA" = home vs Seattle, "@LAC" = at the Chargers) or BYE. Every game shows up in both teams' rows, so
// the two are merged; if they disagree, the clash is flagged.
function siGridHeader(cells) {
  const weeks = cells.slice(1).filter((c) => /^\s*\d{1,2}\s*$/.test(c)).length;
  return /^\s*team\s*$/i.test(cells[0] || "") && weeks >= 2;
}
function siParseGrid(table, headerIndex) {
  const header = table[headerIndex];
  const weekCols = [];
  header.forEach((cell, i) => { const w = Number(String(cell).trim()); if (i > 0 && Number.isInteger(w) && w >= 1 && w <= 22 && /^\s*\d+\s*$/.test(cell)) weekCols.push([i, w]); });
  const games = new Map();
  const rows = [];
  for (let i = headerIndex + 1; i < table.length; i += 1) {
    const cells = table[i];
    if (cells.every((c) => !String(c).trim())) continue;
    const label = String(cells[0]).trim();
    const team = lookupTeamId(label);
    if (!team) { rows.push({ row: i + 1, week: null, away: "", home: "", date: "", time: "", note: "", problem: `Team "${label}" not recognized` }); continue; }
    for (const [col, week] of weekCols) {
      const value = String(cells[col] ?? "").trim();
      if (!value || /^bye$/i.test(value)) continue;
      const atOpp = value.startsWith("@");
      const oppText = value.replace(/^@\s*/, "").replace(/^vs\.?\s*/i, "");
      const opp = lookupTeamId(oppText);
      if (!opp || opp === team) {
        rows.push({ row: i + 1, week, away: atOpp ? team : "", home: atOpp ? "" : team, date: "", time: "", note: "", problem: `${team}, ${scheduleWeekName(week)}: opponent "${value}" not recognized` });
        continue;
      }
      const away = atOpp ? team : opp, home = atOpp ? opp : team;
      const key = `${week}|${away}|${home}`;
      if (!games.has(key)) {
        const game = { row: i + 1, week, away, home, date: "", time: "", note: "", problem: "" };
        games.set(key, game);
        rows.push(game);
      }
    }
  }
  return rows;
}

function siParse(text) {
  const season = Number(siSeason.value) || leagueSeason();
  // Space-separated rows (e.g. copied from a PDF) become cells too.
  const table = siTable(text).map((cells) => (cells.length === 1 && /\S\s+\S/.test(cells[0]) ? cells[0].trim().split(/\s+/) : cells));
  const gridIndex = table.findIndex(siGridHeader);
  if (gridIndex !== -1) {
    const rows = siParseGrid(table, gridIndex);
    siFlagClashes(rows);
    rows.sort((a, b) => (a.week || 99) - (b.week || 99) || a.row - b.row);
    return { rows, season, grid: true };
  }
  const headerIndex = table.findIndex((cells) => {
    const f = cells.map(siField);
    return (f.includes("away") && f.includes("home")) || f.includes("matchup");
  });
  if (headerIndex === -1) return { error: "Couldn't find a header row: either a schedule grid (TEAM, 1, 2, 3 …) or Week / Away / Home columns (or a Matchup column). Include the header row." };
  const columns = new Map();
  table[headerIndex].forEach((cell, i) => { const f = siField(cell); if (f && !columns.has(f)) columns.set(f, i); });
  if (!columns.has("week")) return { error: "Couldn't find a Week column in the header row." };
  const rows = [];
  for (let i = headerIndex + 1; i < table.length; i += 1) {
    const cells = table[i];
    if (cells.every((c) => !String(c).trim())) continue;
    const cell = (f) => (columns.has(f) ? String(cells[columns.get(f)] ?? "").trim() : "");
    const out = { row: i + 1, week: null, away: "", home: "", date: "", time: cell("time").slice(0, 20), note: cell("note").slice(0, 80), problem: "" };
    out.week = siWeek(cell("week"));
    let awayText = cell("away"), homeText = cell("home");
    if (columns.has("matchup") && (!awayText || !homeText)) {
      const mu = siMatchup(cell("matchup"));
      if (mu) { awayText = mu.away; homeText = mu.home; }
    }
    out.away = lookupTeamId(awayText.replace(/^@\s*/, "")) || "";
    out.home = lookupTeamId(homeText.replace(/^@\s*/, "")) || "";
    const date = siDate(cell("date"), season);
    out.date = date || "";
    if (!out.week) out.problem = `Week "${cell("week")}" isn't 1–18 or a playoff round`;
    else if (!out.away) out.problem = `Away team "${awayText}" not recognized`;
    else if (!out.home) out.problem = `Home team "${homeText}" not recognized`;
    else if (out.away === out.home) out.problem = "Away and home are the same team";
    else if (date === null) out.problem = `Date "${cell("date")}" not recognized`;
    rows.push(out);
  }
  siFlagClashes(rows);
  return { rows, season };
}

// A team can only play once per week within the file.
function siFlagClashes(rows) {
  const seen = new Map();
  for (const out of rows) {
    if (out.problem) continue;
    for (const team of [out.away, out.home]) {
      const key = `${out.week}|${team}`;
      if (seen.has(key)) { const other = seen.get(key); out.problem = `${team} already plays in ${scheduleWeekName(out.week)} (${other.away} @ ${other.home})`; break; }
    }
    if (!out.problem) for (const team of [out.away, out.home]) seen.set(`${out.week}|${team}`, out);
  }
}

const siExisting = (season, r) => officeData.schedule.find((g) => g.season === season && g.week === r.week &&
  ((g.away === r.away && g.home === r.home) || (g.away === r.home && g.home === r.away)));

// ---------- preview ----------
function renderPreview() {
  const season = Number(siSeason.value) || leagueSeason();
  document.querySelector("#si-replace-season").textContent = season;
  if (!parsed.length) { siPreview.hidden = true; return; }
  siPreview.hidden = false;
  const good = parsed.filter((r) => !r.problem);
  const replace = siReplace.checked;
  const updates = replace ? 0 : good.filter((r) => siExisting(season, r)).length;
  const bad = parsed.length - good.length;
  const weeks = new Set(good.map((r) => r.week)).size;
  document.querySelector("#si-preview-title").textContent =
    `Preview · ${good.length} game${good.length === 1 ? "" : "s"} across ${weeks} week${weeks === 1 ? "" : "s"}` +
    (updates ? ` · ${updates} already on the schedule (will be updated)` : "") + (bad ? ` · ${bad} row${bad === 1 ? "" : "s"} skipped` : "");
  siImport.disabled = !good.length || !canSave;
  siImport.textContent = replace ? `Replace ${season} schedule` : "Import schedule";
  siRows.replaceChildren(...parsed.map((r) => {
    const tr = document.createElement("tr");
    if (r.problem) tr.className = "is-problem";
    const status = r.problem ? r.problem : (!replace && siExisting(season, r) ? "Update" : "New");
    for (const value of [r.row, r.week ? scheduleWeekName(r.week) : "—", r.away || "—", r.home || "—", r.date || "", r.time, r.note, status]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    return tr;
  }));
}

function loadText(text, source) {
  const result = siParse(text);
  if (result.error) { parsed = []; siStatus.textContent = `${source}: ${result.error} Nothing was changed.`; renderPreview(); return; }
  parsed = result.rows;
  siStatus.textContent = parsed.length ? `${source} read${result.grid ? " as a schedule grid" : ""}. Check the preview, then import.` : `${source} has a header row but no games.`;
  renderPreview();
}

let pasteTimer = 0;
siPaste.addEventListener("input", () => {
  clearTimeout(pasteTimer);
  pasteTimer = setTimeout(() => { if (siPaste.value.trim()) loadText(siPaste.value, "Pasted rows"); else { parsed = []; siStatus.textContent = ""; renderPreview(); } }, 250);
});
siFile.addEventListener("change", async () => {
  const file = siFile.files[0];
  siFile.value = "";
  if (!file) return;
  if (file.size > 2_000_000) { siStatus.textContent = "That file is over 2 MB, which is too big for a schedule. Nothing was changed."; return; }
  if (/\.xlsx?$/i.test(file.name)) { siStatus.textContent = "Excel files can't be read directly. In Excel or Google Sheets, use File → Download / Save As → CSV, then upload that."; return; }
  siPaste.value = await file.text();
  loadText(siPaste.value, file.name);
});
siSeason.addEventListener("change", () => { if (siPaste.value.trim()) loadText(siPaste.value, "Rows"); renderCurrent(); });
siReplace.addEventListener("change", renderPreview);
document.querySelector("#si-clear").addEventListener("click", () => { siPaste.value = ""; parsed = []; siStatus.textContent = ""; renderPreview(); });

document.querySelector("#si-template").addEventListener("click", () => {
  const csv = "Week,Away,Home,Date,Time,Note\n1,DAL,PHI,2026-09-10,8:20 PM,Kickoff Game\n1,PIT,NYJ,2026-09-13,1:00 PM,\n1,Ravens,Bills,9/13,8:20 PM,Sunday Night Football\n";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "nbnfl-schedule-template.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// ---------- import ----------
function siSave(message) {
  try {
    writeStoredOffice(officeData);
    siStatus.textContent = message;
    return true;
  } catch (error) {
    siStatus.textContent = `Could not save: ${error.message}. Nothing was changed.`;
    officeData = readStoredOffice() || emptyOfficeData();
    if (!Array.isArray(officeData.schedule)) officeData.schedule = [];
    return false;
  }
}

siImport.addEventListener("click", async () => {
  if (!canSave) return;
  const season = Number(siSeason.value);
  if (!Number.isInteger(season) || season < 2000 || season > 2100) { siStatus.textContent = "Enter a season year first."; siSeason.focus(); return; }
  const good = parsed.filter((r) => !r.problem);
  if (!good.length) return;
  const replace = siReplace.checked;
  const onFile = officeData.schedule.filter((g) => g.season === season).length;
  if (replace && onFile) {
    const ok = await confirmAction(`Replace the ${season} schedule? The ${onFile} game${onFile === 1 ? "" : "s"} on it now are removed and the ${good.length} game${good.length === 1 ? "" : "s"} in the preview take their place. Logged box scores and results aren't touched.`, { confirmLabel: `Replace ${season} schedule`, danger: true });
    if (!ok) return;
  }
  if (replace) officeData.schedule = officeData.schedule.filter((g) => g.season !== season);
  let added = 0, updated = 0, full = 0;
  for (const r of good) {
    const existing = siExisting(season, r);
    if (!existing && officeData.schedule.length >= SCHEDULE_LIMIT) { full += 1; continue; }
    const game = existing || { id: newRecordId("sched"), season, week: r.week };
    game.away = r.away;
    game.home = r.home;
    for (const field of ["date", "time", "note"]) { if (r[field]) game[field] = r[field]; else if (!existing) delete game[field]; }
    if (existing) updated += 1; else { officeData.schedule.push(game); added += 1; }
  }
  const skipped = parsed.length - good.length;
  const parts = [replace ? `Replaced the ${season} schedule with ${added} game${added === 1 ? "" : "s"}.` : `Added ${added} and updated ${updated} game${added + updated === 1 ? "" : "s"} on the ${season} schedule.`];
  if (skipped) parts.push(`${skipped} row${skipped === 1 ? " was" : "s were"} skipped (see the preview).`);
  if (full) parts.push(`${full} didn't fit: the schedule holds at most ${SCHEDULE_LIMIT.toLocaleString()} games.`);
  if (siSave(parts.join(" "))) {
    if (!skipped) { siPaste.value = ""; parsed = []; }
    siReplace.checked = false;
  }
  renderPreview();
  renderCurrent();
});

// ---------- what's on file ----------
function renderCurrent() {
  const season = Number(siSeason.value) || leagueSeason();
  document.querySelector("#si-current-season").textContent = season;
  const games = officeData.schedule.filter((g) => g.season === season);
  const byWeek = new Map();
  for (const g of games) byWeek.set(g.week, [...(byWeek.get(g.week) || []), g]);
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  document.querySelector("#si-current-summary").textContent = games.length
    ? `${games.length} game${games.length === 1 ? "" : "s"} across ${weeks.length} week${weeks.length === 1 ? "" : "s"}. Weeks with fewer than 16 games are flagged (byes are normal from Week 5 to 14).`
    : `Nothing is scheduled for ${season} yet.`;
  document.querySelector("#si-wipe").hidden = !games.length || !canSave;
  document.querySelector("#si-weeks").replaceChildren(...weeks.map((w) => {
    const list = byWeek.get(w);
    const teams = new Set(list.flatMap((g) => [g.away, g.home]));
    const card = document.createElement("div");
    card.className = `si-week${w <= 18 && list.length < 16 ? " is-short" : ""}`;
    const b = document.createElement("b");
    b.textContent = scheduleWeekName(w);
    const span = document.createElement("span");
    span.textContent = `${list.length} game${list.length === 1 ? "" : "s"}${w <= 18 && teams.size < 32 ? ` · ${32 - teams.size} on bye` : ""}`;
    card.append(b, span);
    card.title = list.map((g) => `${g.away} @ ${g.home}`).join("\n");
    return card;
  }));
}

document.querySelector("#si-wipe").addEventListener("click", async () => {
  const season = Number(siSeason.value) || leagueSeason();
  const count = officeData.schedule.filter((g) => g.season === season).length;
  if (!count) return;
  if (!await confirmAction(`Remove all ${count} games from the ${season} schedule? Logged box scores and results aren't touched.`, { confirmLabel: "Clear schedule", danger: true })) return;
  officeData.schedule = officeData.schedule.filter((g) => g.season !== season);
  siSave(`Cleared the ${season} schedule (${count} game${count === 1 ? "" : "s"}).`);
  renderPreview();
  renderCurrent();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.schedule)) officeData.schedule = [];
    renderPreview();
    renderCurrent();
  } catch { siStatus.textContent = "An update from another tab could not be read."; }
});

renderPreview();
renderCurrent();
