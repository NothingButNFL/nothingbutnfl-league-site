// Overview "matchday" block, built from the logged box scores (officeData.games) and the schedule:
// - a scrolling score ticker for the most recent week that has results,
// - Game of the Week: next week's biggest matchup (best combined records), or, when nothing is scheduled after the
//   last results, last week's best game with its final score,
// - the Week's Best: the top individual performances from that most recent week.
// Uses teams.js / league-core.js / overview.js globals (overviewLogo, teamThemePalettes, playerPortrait ...).

let mdData = emptyOfficeData();
const mdNum = (v) => Number(v) || 0;
const mdNick = (teamId) => (teamName(teamId) || teamId).split(" ").pop();
const mdFmt = (v) => (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(1));
const mdEl = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };

// Fantasy-style weight of a stat line, used to rank performances.
function mdImpact(v) {
  return mdNum(v.passYds) * 0.04 + mdNum(v.passTd) * 4 - mdNum(v.int) * 2 +
    mdNum(v.rushYds) * 0.1 + mdNum(v.rushTd) * 6 + mdNum(v.recYds) * 0.1 + mdNum(v.recTd) * 6 + mdNum(v.rec) * 0.5 +
    mdNum(v.tackles) * 0.8 + mdNum(v.sacks) * 4 + mdNum(v.defInt) * 5 + mdNum(v.ff) * 3 + mdNum(v.fr) * 3 + mdNum(v.pd) + mdNum(v.defTd) * 6 +
    mdNum(v.fgm) * 3 + mdNum(v.xpm);
}

// "23/34 · 312 YDS · 3 TD" style lines: the one or two stat groups that mattered most.
function mdLines(v, perGame = 0) {
  const per = (n) => (perGame ? mdFmt(Math.round((n / perGame) * 10) / 10) : mdFmt(n));
  const groups = [
    { weight: mdNum(v.passYds) * 0.04 + mdNum(v.passTd) * 4, parts: [[v.passYds, perGame ? "PASS YDS/G" : "PASS YDS", true], [v.passTd, "TD"], [v.int, "INT"]], lead: !perGame && v.att ? `${v.cmp}/${v.att}` : "" },
    { weight: mdNum(v.rushYds) * 0.1 + mdNum(v.rushTd) * 6, parts: [[v.rushYds, perGame ? "RUSH YDS/G" : "RUSH YDS", true], [v.rushTd, "TD"]], lead: !perGame && v.rushAtt ? `${v.rushAtt} CAR` : "" },
    { weight: mdNum(v.recYds) * 0.1 + mdNum(v.recTd) * 6 + mdNum(v.rec) * 0.5, parts: [[v.rec, "REC"], [v.recYds, perGame ? "REC YDS/G" : "REC YDS", true], [v.recTd, "TD"]] },
    { weight: mdNum(v.tackles) * 0.8 + mdNum(v.sacks) * 4 + mdNum(v.defInt) * 5 + mdNum(v.ff) * 3, parts: [[v.tackles, "TKL"], [v.sacks, "SACK"], [v.defInt, "INT"], [v.ff, "FF"], [v.defTd, "TD"]] },
    { weight: mdNum(v.fgm) * 3 + mdNum(v.xpm), parts: [[v.fgm != null ? `${v.fgm}/${v.fga}` : null, "FG"], [v.fgLong, "LONG"]] }
  ].filter((g) => g.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 2);
  return groups.map((g) => [g.lead, ...g.parts.filter(([n]) => n !== null && n !== undefined && n !== 0 && n !== "0/0")
    .map(([n, label, perStat]) => `${typeof n === "number" ? (perStat ? per(n) : mdFmt(n)) : n} ${label}`)]
    .filter(Boolean).join(" · ")).filter(Boolean);
}

// Every player's line in one game: [{ name, team, values, impact }]
function mdGamePerformers(game) {
  const names = new Map();
  for (const lines of Object.values(game.players || {})) for (const l of lines || []) if (l.player) names.set(normalizePlayerName(l.player), l.player);
  return [...names.values()].map((name) => {
    const found = boxScoreStats(game, name);
    return found ? { name, team: found.team, values: found.values, impact: mdImpact(found.values) } : null;
  }).filter(Boolean);
}

const mdSide = (game, teamId) => game.teams.find((t) => t.team === teamId);
const mdResult = (game, teamId) => {
  const me = mdSide(game, teamId), them = game.teams.find((t) => t.team !== teamId);
  if (!me || !them) return "";
  const r = me.score > them.score ? "W" : me.score < them.score ? "L" : "T";
  return `${r} ${me.score}–${them.score} ${game.teams[0].team === teamId ? "@" : "vs"} ${them.team}`;
};

// Records: the saved standings when they're for this season, else counted from the box scores.
function mdRecords(data) {
  const out = {};
  for (const { id } of nflTeams) out[id] = { w: 0, l: 0, t: 0 };
  const saved = data.standings?.teams;
  if (saved && Object.keys(saved).length) {
    for (const [id, r] of Object.entries(saved)) if (out[id]) out[id] = { w: mdNum(r.w), l: mdNum(r.l), t: mdNum(r.t), streak: r.streak };
    return out;
  }
  for (const g of data.games || []) {
    if (g.week > 18 || g.teams.length !== 2) continue;
    const [a, b] = g.teams;
    if (!out[a.team] || !out[b.team]) continue;
    if (a.score === b.score) { out[a.team].t += 1; out[b.team].t += 1; }
    else { out[a.score > b.score ? a.team : b.team].w += 1; out[a.score > b.score ? b.team : a.team].l += 1; }
  }
  return out;
}
const mdRecordText = (r) => r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : "0-0";
const mdPct = (r) => { const n = r.w + r.l + r.t; return n ? (r.w + r.t / 2) / n : 0; };

// A team's best player this season (by total impact), with per-game numbers.
function mdTeamStar(data, teamId) {
  const totals = new Map();
  for (const game of data.games || []) {
    if (game.week > 18 || !game.teams.some((t) => t.team === teamId)) continue;
    for (const p of mdGamePerformers(game)) {
      if (p.team !== teamId) continue;
      const key = normalizePlayerName(p.name);
      const t = totals.get(key) || { name: p.name, team: teamId, values: {}, games: 0, impact: 0 };
      t.games += 1;
      t.impact += p.impact;
      for (const [k, v] of Object.entries(p.values)) t.values[k] = k === "fgLong" ? Math.max(t.values[k] || 0, v) : (t.values[k] || 0) + v;
      totals.set(key, t);
    }
  }
  return [...totals.values()].sort((a, b) => b.impact - a.impact)[0] || null;
}

function mdPlayerPhoto(name, teamId, className) {
  const found = findPlayerByName(mdData, name, teamId);
  const src = found ? profilePhotoSrc(playerProfile(found.player)) : "";
  const wrap = mdEl("span", className);
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.addEventListener("error", () => { img.remove(); wrap.append(overviewLogo(teamId)); wrap.classList.add("is-logo"); }, { once: true });
    wrap.append(img);
  } else { wrap.append(overviewLogo(teamId)); wrap.classList.add("is-logo"); }
  return wrap;
}
function mdPlayerName(name, teamId) {
  const found = findPlayerByName(mdData, name, teamId);
  if (!found) return mdEl("strong", "md-player-name", name);
  const a = mdEl("a", "md-player-name", name);
  a.href = profileUrl(found.player.id);
  return a;
}

// ---------- Ticker ----------
function renderTicker(games, week) {
  const box = document.querySelector("#md-ticker");
  if (!games.length) { box.hidden = true; return; }
  box.hidden = false;
  const label = mdEl("span", "md-ticker-label");
  label.append(mdEl("b", "", week > 18 ? "PLAYOFFS" : `WEEK ${week}`), " SCORES");
  const items = games.map((g) => {
    const a = mdEl("a", "md-tick");
    a.href = "stats.html";
    a.title = `${teamName(g.teams[0].team)} ${g.teams[0].score}, ${teamName(g.teams[1].team)} ${g.teams[1].score}`;
    const top = Math.max(g.teams[0].score, g.teams[1].score);
    g.teams.forEach((t, i) => {
      if (i) a.append(mdEl("span", "md-tick-at", "@"));
      const side = mdEl("span", `md-tick-team${t.score === top && g.teams[0].score !== g.teams[1].score ? " is-winner" : ""}`);
      side.append(overviewLogo(t.team), mdEl("span", "md-tick-code", t.team), mdEl("b", "md-tick-score", String(t.score)));
      a.append(side);
    });
    return a;
  });
  const track = mdEl("div", "md-ticker-track");
  const run = mdEl("div", "md-ticker-run");
  run.append(...items);
  // A second copy makes the loop seamless; screen readers skip it.
  const copy = run.cloneNode(true);
  copy.setAttribute("aria-hidden", "true");
  copy.querySelectorAll("a").forEach((a) => { a.tabIndex = -1; });
  track.append(run, copy);
  track.style.setProperty("--md-ticker-time", `${Math.max(30, games.length * 5)}s`);
  const viewport = mdEl("div", "md-ticker-viewport");
  viewport.append(track);
  box.replaceChildren(label, viewport);
}

// ---------- Game of the Week ----------
function mdPickUpcoming(data, records, nextWeek) {
  const season = data.standings?.season;
  const slate = (data.schedule || []).filter((s) => s.week === nextWeek && (!season || !s.season || s.season === season));
  const played = new Set((data.games || []).filter((g) => g.week === nextWeek).flatMap((g) => g.teams.map((t) => t.team)));
  const open = slate.filter((s) => !played.has(s.away) && !played.has(s.home));
  if (!open.length) return null;
  const score = (s) => mdPct(records[s.away]) + mdPct(records[s.home]) - Math.abs(mdPct(records[s.away]) - mdPct(records[s.home])) * 0.5;
  const pick = [...open].sort((a, b) => score(b) - score(a))[0];
  return { kind: "upcoming", week: nextWeek, away: pick.away, home: pick.home, date: pick.date, time: pick.time, slate: open.length };
}
function mdPickFinal(games, week) {
  if (!games.length) return null;
  const score = (g) => {
    const [a, b] = g.teams;
    const before = g.standingsBefore || {};
    const pct = (id) => mdPct(before[id] || { w: 0, l: 0, t: 0 });
    return (pct(a.team) + pct(b.team)) * 10 + (a.score + b.score) * 0.15 - Math.abs(a.score - b.score) * 0.6;
  };
  const game = [...games].sort((x, y) => score(y) - score(x))[0];
  return { kind: "final", week, game, away: game.teams[0].team, home: game.teams[1].team, date: game.date };
}

function mdTeamPanel(teamId, record, featured, side) {
  const panel = mdEl("div", `md-gotw-side is-${side}`);
  const [base, accent] = teamThemePalettes[teamId] || ["#0c2b50", "#8fd0ff"];
  panel.style.setProperty("--md-team", base);
  panel.style.setProperty("--md-accent", accent);
  const photo = featured ? mdPlayerPhoto(featured.name, teamId, "md-gotw-photo") : mdEl("span", "md-gotw-photo is-logo");
  if (!featured) photo.append(overviewLogo(teamId));
  const name = mdEl("div", "md-gotw-name");
  if (featured) {
    const last = featured.name.split(" ").slice(1).join(" ") || featured.name;
    const link = mdPlayerName(featured.name, teamId);
    link.textContent = last.toUpperCase();
    link.title = featured.name;
    name.append(link);
    const lines = mdLines(featured.values, featured.games || 0);
    if (lines.length) name.append(mdEl("span", "md-gotw-line", lines[0]));
    name.append(mdEl("span", "md-gotw-sub", featured.games ? `${featured.name} · season` : featured.name));
  }
  const team = mdEl("a", "md-gotw-team");
  team.href = `team.html?team=${encodeURIComponent(teamId)}`;
  team.append(overviewLogo(teamId), mdEl("b", "", teamId), mdEl("span", "", record));
  panel.append(photo, name, team);
  return panel;
}

function renderGameOfWeek(pick, records) {
  const box = document.querySelector("#md-gotw");
  if (!pick) { box.hidden = true; return; }
  box.hidden = false;
  const final = pick.kind === "final";
  const g = pick.game;
  // Featured players: the top performer in the game (final) or each team's season star (upcoming).
  const perf = final ? mdGamePerformers(g) : [];
  const star = (teamId) => final
    ? perf.filter((p) => p.team === teamId).sort((a, b) => b.impact - a.impact)[0] || null
    : mdTeamStar(mdData, teamId);
  // No dates: the league's streams don't happen on the scheduled game dates.

  // Centered heading: "WEEK 18 | GAME OF THE WEEK", with the status underneath.
  const head = mdEl("div", "md-gotw-head");
  const title = mdEl("strong", "md-gotw-title");
  title.append(mdEl("span", "md-gotw-week", pick.week > 18 ? "PLAYOFFS" : `WEEK ${pick.week}`), mdEl("span", "md-gotw-divider", "|"), mdEl("span", "", "GAME OF THE WEEK"));
  head.append(title, mdEl("span", "md-gotw-date", final ? "FINAL" : `${pick.slate} GAME${pick.slate === 1 ? "" : "S"} THIS WEEK`));
  const center = mdEl("div", "md-gotw-vs");
  if (final) {
    const [a, b] = g.teams;
    center.append(mdEl("strong", "md-gotw-score", `${a.score}–${b.score}`), mdEl("span", "", `${pick.away} @ ${pick.home} · FINAL`));
  } else center.append(mdEl("strong", "md-gotw-vs-text", "VS"), mdEl("span", "", `${pick.away} @ ${pick.home}`));
  const stage = mdEl("div", "md-gotw-stage");
  stage.append(
    mdTeamPanel(pick.away, mdRecordText(records[pick.away]), star(pick.away), "away"),
    center,
    mdTeamPanel(pick.home, mdRecordText(records[pick.home]), star(pick.home), "home")
  );
  // Little storyline strip under the matchup.
  const notes = [];
  for (const id of [pick.away, pick.home]) {
    const r = records[id];
    if (r?.streak && /^W[3-9]|^W\d\d/.test(r.streak)) notes.push(`${teamName(id)} have won ${r.streak.slice(1)} straight`);
  }
  if (final) {
    const [a, b] = g.teams;
    const margin = Math.abs(a.score - b.score);
    if (margin <= 3) notes.push(`Decided by ${margin === 0 ? "a tie" : `${margin} point${margin === 1 ? "" : "s"}`}`);
    const top = perf.sort((x, y) => y.impact - x.impact)[0];
    if (top) notes.push(`${top.name}: ${mdLines(top.values)[0] || ""}`);
  } else {
    for (const id of [pick.away, pick.home]) notes.push(`${mdNick(id)} ${mdRecordText(records[id])}`);
  }
  const strip = mdEl("div", "md-gotw-notes");
  for (const n of notes) strip.append(mdEl("span", "", n.toUpperCase()));
  box.replaceChildren(head, stage, strip);
  box.style.setProperty("--md-away", (teamThemePalettes[pick.away] || ["#0c2b50"])[0]);
  box.style.setProperty("--md-home", (teamThemePalettes[pick.home] || ["#0c2b50"])[0]);
}

// ---------- Week's Best ----------
function renderWeeksBest(games, week) {
  const box = document.querySelector("#md-best");
  if (!games.length) { box.hidden = true; return; }
  box.hidden = false;
  const all = games.flatMap((g) => mdGamePerformers(g).map((p) => ({ ...p, game: g })));
  const best = all.sort((a, b) => b.impact - a.impact).slice(0, 5);
  const head = mdEl("h3", "md-best-title");
  head.append(`${week > 18 ? "Playoffs" : `Week ${week}`}'s Best`);
  const list = mdEl("ol", "md-best-list");
  list.append(...best.map((p) => {
    const li = mdEl("li", "md-best-item");
    const [base, accent] = teamThemePalettes[p.team] || ["#0c2b50", "#8fd0ff"];
    li.style.setProperty("--md-team", base);
    li.style.setProperty("--md-accent", accent);
    li.append(mdPlayerPhoto(p.name, p.team, "md-best-photo"));
    const text = mdEl("div", "md-best-text");
    text.append(mdPlayerName(p.name, p.team));
    const lines = mdLines(p.values);
    if (lines.length) text.append(mdEl("span", "md-best-line", lines[0]));
    const meta = mdEl("span", "md-best-meta");
    meta.append(overviewLogo(p.team), `${p.team} · ${mdResult(p.game, p.team)}`);
    text.append(meta);
    li.append(text);
    return li;
  }));
  box.replaceChildren(head, list);
}

function renderMatchday() {
  const section = document.querySelector("#matchday");
  if (!section) return;
  let data;
  try { data = readStoredOffice() || emptyOfficeData(); } catch { data = emptyOfficeData(); }
  mdData = data;
  const games = (data.games || []).filter((g) => g.teams?.length === 2 && g.week != null);
  if (!games.length) { section.hidden = true; document.querySelector("#md-ticker").hidden = true; return; }
  const week = Math.max(...games.map((g) => g.week));
  const lastWeek = games.filter((g) => g.week === week).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const records = mdRecords(data);
  section.hidden = false;
  renderTicker(lastWeek, week);
  renderGameOfWeek(mdPickUpcoming(data, records, week + 1) || mdPickFinal(lastWeek, week), records);
  renderWeeksBest(lastWeek, week);
}

renderMatchday();
window.addEventListener("storage", (event) => { if (event.key === officeStorageKey) renderMatchday(); });
