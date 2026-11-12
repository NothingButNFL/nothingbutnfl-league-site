// Overview "matchday" block, built from the logged box scores (officeData.games) and the schedule:
// - a scrolling score ticker for the most recent week that has results,
// - Game of the Week: next week's biggest matchup (best combined records), or, when nothing is scheduled after the
//   last results, last week's best game with its final score,
// - one preview pane per game that week (three at a time, PREV / NEXT),
// - Top Players: a tab per week with the AFC / NFC offensive and defensive player of the week.
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
// Last week's scores; before any box scores are logged, the upcoming week's matchups (with records) instead.
function renderTicker(games, week, upcoming = null, records = null) {
  const box = document.querySelector("#md-ticker");
  if (!games.length && !upcoming?.slate?.length) { box.hidden = true; return; }
  box.hidden = false;
  const label = mdEl("span", "md-ticker-label");
  if (!games.length) {
    label.append(mdEl("b", "", upcoming.week > 18 ? "PLAYOFFS" : `WEEK ${upcoming.week}`), " MATCHUPS");
    const items = upcoming.slate.map((s) => {
      const a = mdEl("a", "md-tick");
      a.href = "schedule.html";
      a.title = `${teamName(s.away)} at ${teamName(s.home)}`;
      [s.away, s.home].forEach((id, i) => {
        if (i) a.append(mdEl("span", "md-tick-at", "@"));
        const side = mdEl("span", "md-tick-team is-winner");
        side.append(overviewLogo(id), mdEl("span", "md-tick-code", id), mdEl("b", "md-tick-score md-tick-record", mdRecordText(records?.[id])));
        a.append(side);
      });
      return a;
    });
    return mdFillTicker(box, label, items);
  }
  label.append(mdEl("b", "", week > 18 ? "PLAYOFFS" : `WEEK ${week}`), " SCORES");
  const items = games.map((g) => {
    const a = mdEl("a", "md-tick");
    a.href = `boxscore.html?id=${encodeURIComponent(g.id)}`; // the game's box score
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
  mdFillTicker(box, label, items);
}
function mdFillTicker(box, label, items) {
  const track = mdEl("div", "md-ticker-track");
  const run = mdEl("div", "md-ticker-run");
  run.append(...items);
  // A second copy makes the loop seamless; screen readers skip it.
  const copy = run.cloneNode(true);
  copy.setAttribute("aria-hidden", "true");
  copy.querySelectorAll("a").forEach((a) => { a.tabIndex = -1; });
  track.append(run, copy);
  track.style.setProperty("--md-ticker-time", `${Math.max(30, items.length * 5)}s`);
  const viewport = mdEl("div", "md-ticker-viewport");
  viewport.append(track);
  box.replaceChildren(label, viewport);
}

// ---------- Game of the Week ----------
// The season the Overview follows: the standings' season, else the latest season on the schedule.
function mdSeason(data) {
  if (data.standings?.season) return data.standings.season;
  const seasons = (data.schedule || []).map((s) => s.season).filter(Number.isInteger);
  return seasons.length ? Math.max(...seasons) : null;
}
function mdPickUpcoming(data, records, nextWeek) {
  const season = mdSeason(data);
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
    const side = mdOffImpact(featured.values) >= mdDefImpact(featured.values) ? "offense" : "defense";
    name.append(mdEl("span", "md-gotw-pos", mdPosition(featured.name, teamId, featured.values, side)));
    const link = mdPlayerName(featured.name, teamId);
    link.textContent = featured.name.toUpperCase();
    link.title = featured.name;
    link.classList.add("md-fit-name");
    name.append(link);
    const lines = mdLines(featured.values, featured.games || 0);
    if (lines.length) name.append(mdEl("span", "md-gotw-line", lines[0]));
    if (featured.games) name.append(mdEl("span", "md-gotw-sub", "Season averages"));
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
  const previewButton = mdEl("button", "md-gotw-preview", final ? "GAME RECAP" : "PREVIEW");
  previewButton.type = "button";
  previewButton.addEventListener("click", () => openGamePreview({ away: pick.away, home: pick.home, game: final ? g : null }, pick.week));
  center.append(previewButton);
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
  mdFitTopNames();
  box.querySelectorAll(".md-gotw-name").forEach((el) => mdFitObserver?.observe(el));
  box.style.setProperty("--md-away", (teamThemePalettes[pick.away] || ["#0c2b50"])[0]);
  box.style.setProperty("--md-home", (teamThemePalettes[pick.home] || ["#0c2b50"])[0]);
}

// ---------- This week's games: one preview pane per game, three at a time ----------
// The same week as the Game of the Week: scheduled games (with the score once it's logged) or, with no schedule,
// the logged results.
function mdWeekSlate(data, pick, games) {
  if (!pick) return [];
  const season = mdSeason(data);
  const results = games.filter((g) => g.week === pick.week);
  const resultFor = (away, home) => results.find((g) => g.teams.some((t) => t.team === away) && g.teams.some((t) => t.team === home));
  const sched = (data.schedule || []).filter((s) => s.week === pick.week && (!season || !s.season || s.season === season));
  const slate = sched.length
    ? sched.map((s) => ({ away: s.away, home: s.home, game: resultFor(s.away, s.home) || null }))
    : results.map((g) => ({ away: g.teams[0].team, home: g.teams[1].team, game: g }));
  for (const g of results) if (!slate.some((s) => s.game === g)) slate.push({ away: g.teams[0].team, home: g.teams[1].team, game: g });
  const featured = (s) => s.away === pick.away && s.home === pick.home;
  return [...slate.filter(featured), ...slate.filter((s) => !featured(s))].map((s) => ({ ...s, featured: featured(s) }));
}

function mdSlatePane(item, records) {
  const pane = mdEl("article", `md-slate-pane${item.featured ? " is-featured" : ""}`);
  pane.style.setProperty("--md-away", (teamThemePalettes[item.away] || ["#0c2b50"])[0]);
  pane.style.setProperty("--md-home", (teamThemePalettes[item.home] || ["#0c2b50"])[0]);
  const g = item.game;
  const scoreOf = (id) => g ? g.teams.find((t) => t.team === id)?.score : null;
  const top = g ? Math.max(...g.teams.map((t) => t.score)) : null;
  const tied = g && g.teams[0].score === g.teams[1].score;
  // The tag opens the game preview (or recap, once it's been played).
  const tag = mdEl("button", "md-slate-tag", g ? "FINAL" : "PREVIEW");
  tag.type = "button";
  tag.title = g ? `${item.away} @ ${item.home}: game recap` : `${item.away} @ ${item.home}: game preview`;
  tag.addEventListener("click", () => openGamePreview(item, mdCurrentWeek));
  pane.append(tag);
  const rows = mdEl("div", "md-slate-rows");
  for (const [id, where] of [[item.away, "AWAY"], [item.home, "HOME"]]) {
    const row = mdEl("a", `md-slate-team${g && !tied && scoreOf(id) === top ? " is-winner" : ""}`);
    row.href = `team.html?team=${encodeURIComponent(id)}`;
    const name = mdEl("span", "md-slate-name");
    name.append(mdEl("b", "", teamName(id) || id), mdEl("small", "", `${where} · ${mdRecordText(records[id])}`));
    row.append(overviewLogo(id), name, mdEl("strong", "md-slate-score", g ? String(scoreOf(id)) : ""));
    rows.append(row);
  }
  pane.append(rows);
  let note = "";
  if (g) {
    const best = mdGamePerformers(g).sort((a, b) => b.impact - a.impact)[0];
    if (best) note = `${best.name}: ${mdLines(best.values)[0] || ""}`;
  } else {
    const stars = [item.away, item.home].map((id) => mdTeamStar(mdData, id)).filter(Boolean);
    if (stars.length) note = `Players to watch: ${stars.map((p) => `${p.name} (${p.team})`).join(", ")}`;
  }
  if (note) pane.append(mdEl("p", "md-slate-note", note));
  return pane;
}
let mdCurrentWeek = null;

function renderWeekSlate(slate, pick, records) {
  mdCurrentWeek = pick?.week ?? null;
  const box = document.querySelector("#md-slate");
  box.hidden = false;
  if (!slate.length) {
    const head = mdEl("div", "md-slate-head");
    head.append(mdEl("h3", "md-best-title", `${(pick?.week ?? 1) > 18 ? "Playoffs" : `Week ${pick?.week ?? 1}`} Games`));
    box.replaceChildren(head, mdEl("p", "md-empty-note", pick ? "No other games this week." : "No games scheduled yet. Each game gets a preview card here once the schedule is imported."));
    return;
  }
  const head = mdEl("div", "md-slate-head");
  head.append(mdEl("h3", "md-best-title", `${pick.week > 18 ? "Playoffs" : `Week ${pick.week}`} Games`));
  const prev = mdEl("button", "md-slate-nav", "PREV");
  const next = mdEl("button", "md-slate-nav", "NEXT");
  prev.type = next.type = "button";
  prev.setAttribute("aria-label", "Previous games");
  next.setAttribute("aria-label", "Next games");
  const viewport = mdEl("div", "md-slate-viewport");
  const track = mdEl("div", "md-slate-track");
  track.append(...slate.map((item) => mdSlatePane(item, records)));
  viewport.append(track);
  // Pages of whole panes (3 on desktop, fewer on narrow screens; set in CSS with --md-per).
  let page = 0;
  const perPage = () => Math.max(1, Number(getComputedStyle(viewport).getPropertyValue("--md-per")) || 3);
  const update = () => {
    const per = perPage();
    const pages = Math.max(1, Math.ceil(slate.length / per));
    page = Math.min(page, pages - 1);
    const pane = track.children[page * per];
    track.style.transform = pane ? `translateX(${-pane.offsetLeft}px)` : "";
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
    pager.hidden = pages === 1;
    // One dot per page; rebuilt when the page count changes with the screen width.
    if (dots.children.length !== pages) {
      dots.replaceChildren(...Array.from({ length: pages }, (_, i) => {
        const dot = mdEl("button", "md-top-dot");
        dot.type = "button";
        dot.setAttribute("aria-label", `Games page ${i + 1} of ${pages}`);
        dot.addEventListener("click", () => { page = i; update(); });
        return dot;
      }));
    }
    [...dots.children].forEach((dot, i) => {
      dot.classList.toggle("is-active", i === page);
      if (i === page) dot.setAttribute("aria-current", "true"); else dot.removeAttribute("aria-current");
    });
  };
  // PREV · one dot per page · NEXT along the bottom, like Top Players.
  const dots = mdEl("div", "md-top-dots");
  dots.setAttribute("aria-label", "Pages");
  const pager = mdEl("div", "md-top-pager");
  pager.append(prev, dots, next);
  prev.addEventListener("click", () => { page -= 1; update(); });
  next.addEventListener("click", () => { page += 1; update(); });
  box.replaceChildren(head, viewport, pager);
  update();
  box._mdResize?.disconnect();
  box._mdResize = new ResizeObserver(update);
  box._mdResize.observe(viewport);
}

// ---------- Scoreboard (right of the Game of the Week): every game of the week + teams on bye ----------
let mdBoardWeek = null;
function renderScoreboard(data, pick, games, records) {
  const box = document.querySelector("#md-board");
  if (!box) return;
  if (!pick) { box.hidden = true; return; }
  box.hidden = false;
  const thisWeek = pick.week;
  const lastWeek = thisWeek > 1 ? thisWeek - 1 : null;
  if (mdBoardWeek !== thisWeek && mdBoardWeek !== lastWeek) mdBoardWeek = thisWeek;
  const week = mdBoardWeek;
  const label = (w) => (w > 18 ? mdWeekName(w).replace(/\B\w+/g, (m) => m.toLowerCase()) : `Week ${w}`);
  const head = mdEl("div", "md-board-head");
  head.append(mdEl("h3", "md-board-title", "Scoreboard"));
  const toggle = mdEl("div", "md-board-toggle");
  toggle.setAttribute("role", "tablist");
  for (const [w, text] of [[lastWeek, lastWeek ? label(lastWeek) : ""], [thisWeek, `${label(thisWeek)}${pick.kind === "upcoming" ? " · This week" : ""}`]]) {
    if (!w) continue;
    const b = mdEl("button", `md-board-tab${w === week ? " is-active" : ""}`, text);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(w === week));
    b.addEventListener("click", () => { mdBoardWeek = w; renderScoreboard(data, pick, games, records); });
    toggle.append(b);
  }
  head.append(toggle);
  const slate = mdWeekSlate(data, week === thisWeek ? pick : { week, away: "", home: "" }, games);
  const list = mdEl("ol", "md-board-list");
  for (const item of slate) {
    const li = mdEl("li", `md-board-game${item.featured ? " is-featured" : ""}${item.game ? " is-final" : ""}`);
    li.title = item.featured ? "Game of the Week" : "";
    const g = item.game;
    const scoreOf = (id) => g?.teams.find((t) => t.team === id)?.score;
    const winner = g && g.teams[0].score !== g.teams[1].score ? (g.teams[0].score > g.teams[1].score ? g.teams[0].team : g.teams[1].team) : null;
    const side = (id) => {
      const a = mdEl("a", `md-board-team${winner === id ? " is-winner" : ""}${winner && winner !== id ? " is-loser" : ""}`);
      a.href = `team.html?team=${encodeURIComponent(id)}`;
      a.title = teamName(id);
      a.append(overviewLogo(id), mdEl("b", "", id), mdEl("span", "md-board-num", g ? String(scoreOf(id)) : mdRecordText(records[id])));
      return a;
    };
    li.append(side(item.away), mdEl("span", "md-board-at", "@"), side(item.home), mdEl("span", "md-board-status", g ? "F" : ""));
    list.append(li);
  }
  if (!slate.length) list.append(mdEl("li", "md-board-empty", "No games scheduled."));
  // Teams with no game this week (only when the week has games).
  const playing = new Set(slate.flatMap((s) => [s.away, s.home]));
  const byes = slate.length && week <= 18 ? nflTeams.map(({ id }) => id).filter((id) => !playing.has(id)) : [];
  const parts = [head, list];
  if (byes.length) {
    const bye = mdEl("div", "md-board-byes");
    bye.append(mdEl("span", "md-board-bye-label", "BYE"));
    const teams = mdEl("div", "md-board-bye-teams");
    for (const id of byes) {
      const a = mdEl("a", "md-board-bye-team");
      a.href = `team.html?team=${encodeURIComponent(id)}`;
      a.title = `${teamName(id)} (${mdRecordText(records[id])})`;
      a.append(overviewLogo(id), mdEl("b", "", id));
      teams.append(a);
    }
    bye.append(teams);
    parts.push(bye);
  }
  box.replaceChildren(...parts);
}

// ---------- Top Players: one tab per week; AFC / NFC offense and defense player of the week ----------
const mdConference = (teamId) => nflDivisions.find((d) => d.teams.includes(teamId))?.conference || "";
const mdWeekName = (week) => ({ 19: "WILD CARD", 20: "DIVISIONAL", 21: "CONF. CHAMPIONSHIP", 22: "SUPER BOWL" })[week] || `WEEK ${week}`;
const mdOffImpact = (v) => mdNum(v.passYds) * 0.04 + mdNum(v.passTd) * 4 - mdNum(v.int) * 2 + mdNum(v.rushYds) * 0.1 + mdNum(v.rushTd) * 6 +
  mdNum(v.recYds) * 0.1 + mdNum(v.recTd) * 6 + mdNum(v.rec) * 0.5;
const mdDefImpact = (v) => mdNum(v.tackles) * 0.8 + mdNum(v.tfl) + mdNum(v.sacks) * 4 + mdNum(v.defInt) * 5 + mdNum(v.ff) * 3 + mdNum(v.fr) * 3 + mdNum(v.pd) + mdNum(v.defTd) * 6;

// "J.COOK III"
function mdShortName(name) {
  const parts = String(name).trim().split(/\s+/);
  return (parts.length > 1 ? `${parts[0][0]}.${parts.slice(1).join(" ")}` : parts[0]).toUpperCase();
}
function mdPosition(name, teamId, values, side) {
  const found = findPlayerByName(mdData, name, teamId);
  const pos = found ? (found.source === "sheet" ? playerDisplayPosition(found.player) : found.player.position) : "";
  if (pos) return String(pos).toUpperCase();
  if (side === "defense") return "DEF";
  if (values.att) return "QB";
  return mdNum(values.rushYds) > mdNum(values.recYds) ? "HB" : "WR";
}
// Full comma-separated line, e.g. "25 CAR, 206 RUSH YDS, 8.2 RUSH AVG, 2 RUSH TD, 4 REC, 14 REC YDS".
function mdFullLine(v, side) {
  const out = [];
  const add = (n, label, always = false) => { if (always || mdNum(n)) out.push(`${mdFmt(mdNum(n))} ${label}`); };
  const avg = (yds, n) => (Math.round((mdNum(yds) / n) * 10) / 10).toFixed(1);
  if (side === "defense") {
    add(v.tackles, "TKL", true); add(v.tfl, "TFL"); add(v.sacks, mdNum(v.sacks) === 1 ? "SACK" : "SACKS"); add(v.defInt, "INT");
    add(v.ff, "FF"); add(v.fr, "FR"); add(v.pd, "PD"); add(v.defTd, "TD");
    return out.join(", ");
  }
  if (mdNum(v.att)) { out.push(`${mdNum(v.cmp)}-${mdNum(v.att)}`); add(v.passYds, "PASS YDS", true); add(v.passTd, "PASS TD"); add(v.int, "INT"); }
  if (mdNum(v.rushAtt) || mdNum(v.rushYds)) {
    add(v.rushAtt, "CAR"); add(v.rushYds, "RUSH YDS", true);
    if (!mdNum(v.att) && mdNum(v.rushAtt) >= 5) out.push(`${avg(v.rushYds, mdNum(v.rushAtt))} RUSH AVG`);
    add(v.rushTd, "RUSH TD");
  }
  if (mdNum(v.rec)) { add(v.rec, "REC"); add(v.recYds, "REC YDS", true); if (mdNum(v.rec) >= 2) out.push(`${avg(v.recYds, mdNum(v.rec))} REC AVG`); add(v.recTd, "REC TD"); }
  return out.join(", ");
}

function mdTopPlayers(weekGames) {
  const all = weekGames.flatMap((g) => mdGamePerformers(g));
  const pick = (conf, side) => {
    const score = side === "offense" ? mdOffImpact : mdDefImpact;
    return all.filter((p) => mdConference(p.team) === conf)
      .filter((p) => side === "offense" ? mdOffImpact(p.values) >= mdDefImpact(p.values) : mdDefImpact(p.values) > mdOffImpact(p.values))
      .sort((a, b) => score(b.values) - score(a.values))[0] || null;
  };
  return [["AFC", "offense"], ["NFC", "offense"], ["AFC", "defense"], ["NFC", "defense"]].map(([conf, side]) => ({ conf, side, player: pick(conf, side) }));
}

function mdTopCard({ conf, side, player }) {
  const card = mdEl("article", `md-top-card is-${conf.toLowerCase()}`);
  card.append(mdEl("h4", "md-top-label", `${conf} ${side.toUpperCase()}`));
  const body = mdEl("div", "md-top-body");
  const art = mdEl("div", "md-top-art");
  const confLogo = document.createElement("img");
  confLogo.className = "md-top-conf";
  confLogo.src = `assets/${conf.toLowerCase()}.png`;
  confLogo.alt = "";
  art.append(confLogo);
  const info = mdEl("div", "md-top-info");
  if (!player) {
    info.append(mdEl("p", "md-top-empty", "No stats logged"));
    body.append(art, info);
    card.append(body);
    return card;
  }
  const found = findPlayerByName(mdData, player.name, player.team);
  const src = found ? profilePhotoSrc(playerProfile(found.player)) : "";
  if (src) {
    const img = document.createElement("img");
    img.className = "md-top-photo";
    img.src = src;
    img.alt = "";
    img.addEventListener("error", () => img.remove(), { once: true });
    art.append(img);
  }
  const top = mdEl("div", "md-top-head");
  const who = mdEl("div", "md-top-who");
  who.append(mdEl("span", "md-top-pos", mdPosition(player.name, player.team, player.values, side)));
  const name = mdPlayerName(player.name, player.team);
  name.classList.add("md-top-name");
  name.textContent = player.name.toUpperCase();
  name.title = player.name;
  who.append(name);
  const team = mdEl("a", "md-top-team");
  team.href = `team.html?team=${encodeURIComponent(player.team)}`;
  team.title = teamName(player.team);
  team.append(overviewLogo(player.team));
  top.append(who, team);
  // Each stat stays on one line; the list wraps between stats.
  const stats = mdEl("p", "md-top-stats");
  mdFullLine(player.values, side).split(", ").forEach((part, i, all) => stats.append(mdEl("span", "", i < all.length - 1 ? `${part},` : part), i < all.length - 1 ? " " : ""));
  info.append(top, stats);
  body.append(art, info);
  card.append(body);
  return card;
}

// Full names on one line: shrink each name's text until it fits its card (never below 12px).
function mdFitTopNames() {
  for (const el of document.querySelectorAll(".md-top-name, .md-fit-name")) {
    el.style.fontSize = "";
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth + 1 && size > 12) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }
}
// Refit whenever the cards change width (window resize, sidebar collapse) and once the web font loads.
const mdFitObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestAnimationFrame(mdFitTopNames)) : null;
document.fonts?.ready.then(mdFitTopNames);

let mdTopWeek = null;
function renderWeeksBest(games, emptyWeek = 1) {
  const box = document.querySelector("#md-best");
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
  if (!weeks.length) { // no box scores yet: the four award cards, each "No stats logged"
    box.hidden = false;
    const head = mdEl("div", "md-slate-head md-top-head-row");
    head.append(mdEl("h3", "md-best-title md-top-title", `Top Players: ${mdWeekName(emptyWeek).replace(/\B\w+/g, (m) => m.toLowerCase())}`));
    const grid = mdEl("div", "md-top-grid");
    grid.append(...mdTopPlayers([]).map(mdTopCard));
    // The description goes behind a ? bubble next to the heading (help-bubbles.js).
    const note = mdEl("p", "section-subtitle", "The week's top offensive and defensive players show here once box scores are logged.");
    head.append(note);
    box.replaceChildren(head, grid);
    globalThis.addHelpBubble?.(note);
    return;
  }
  box.hidden = false;
  if (!weeks.includes(mdTopWeek)) mdTopWeek = weeks[weeks.length - 1];
  // Heading, then the cards, then PREV / one dot per week / NEXT.
  const at = weeks.indexOf(mdTopWeek);
  const go = (w) => { mdTopWeek = w; renderWeeksBest(games); box.querySelector(`.md-top-dot[data-week="${w}"], .md-slate-nav:not(:disabled)`)?.focus({ preventScroll: true }); };
  const head = mdEl("div", "md-slate-head md-top-head-row");
  head.append(mdEl("h3", "md-best-title md-top-title", `Top Players: ${mdWeekName(mdTopWeek).replace(/\B\w+/g, (m) => m.toLowerCase())}`));
  const prev = mdEl("button", "md-slate-nav", "PREV");
  const next = mdEl("button", "md-slate-nav", "NEXT");
  prev.type = next.type = "button";
  prev.setAttribute("aria-label", "Previous week");
  next.setAttribute("aria-label", "Next week");
  prev.disabled = at <= 0;
  next.disabled = at >= weeks.length - 1;
  prev.addEventListener("click", () => go(weeks[at - 1]));
  next.addEventListener("click", () => go(weeks[at + 1]));
  const grid = mdEl("div", "md-top-grid");
  grid.setAttribute("aria-live", "polite");
  grid.append(...mdTopPlayers(games.filter((g) => g.week === mdTopWeek)).map(mdTopCard));
  const dots = mdEl("div", "md-top-dots");
  dots.setAttribute("aria-label", "Weeks");
  for (const w of weeks) {
    const dot = mdEl("button", `md-top-dot${w === mdTopWeek ? " is-active" : ""}`);
    dot.type = "button";
    dot.dataset.week = w;
    dot.title = mdWeekName(w).replace(/\B\w+/g, (m) => m.toLowerCase());
    dot.setAttribute("aria-label", dot.title);
    if (w === mdTopWeek) dot.setAttribute("aria-current", "true");
    dot.addEventListener("click", () => go(w));
    dots.append(dot);
  }
  // PREV · dots · NEXT along the bottom.
  const pager = mdEl("div", "md-top-pager");
  pager.hidden = weeks.length === 1;
  pager.append(prev, dots, next);
  box.replaceChildren(head, grid, pager);
  mdFitTopNames();
  mdFitObserver?.disconnect();
  document.querySelectorAll(".md-gotw-name").forEach((el) => mdFitObserver?.observe(el));
  grid.querySelectorAll(".md-top-who").forEach((el) => mdFitObserver?.observe(el));
}

function renderMatchday() {
  const section = document.querySelector("#matchday");
  if (!section) return;
  let data;
  try { data = readStoredOffice() || emptyOfficeData(); } catch { data = emptyOfficeData(); }
  mdData = data;
  const games = (data.games || []).filter((g) => g.teams?.length === 2 && g.week != null);
  const records = mdRecords(data);
  // No box scores yet (start of a season): preview the first scheduled week. Scores and Top Players need box scores.
  const season = mdSeason(data);
  const scheduledWeeks = (data.schedule || []).filter((s) => !season || !s.season || s.season === season).map((s) => s.week);
  const week = games.length ? Math.max(...games.map((g) => g.week)) : (scheduledWeeks.length ? Math.min(...scheduledWeeks) - 1 : 0);
  const lastWeek = games.filter((g) => g.week === week).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const pick = mdPickUpcoming(data, records, week + 1) || mdPickFinal(lastWeek, week);
  if (!pick) { renderMatchdayEmpty(games); return; }
  section.hidden = false;
  renderTicker(lastWeek, week, pick.kind === "upcoming" ? { week: pick.week, slate: mdWeekSlate(data, pick, games) } : null, records);
  renderGameOfWeek(pick, records);
  renderWeekSlate(mdWeekSlate(data, pick, games).filter((item) => !item.featured), pick, records); // the Game of the Week has its own panel
  renderScoreboard(data, pick, games, records);
  renderWeeksBest(games);
}

// Nothing scheduled or played yet: the same panels, with placeholders that say what fills them.
function renderMatchdayEmpty(games) {
  document.querySelector("#matchday").hidden = false;
  const link = (href, text) => { const a = mdEl("a", "md-empty-link", text); a.href = href; return a; };
  // Ticker
  const ticker = document.querySelector("#md-ticker");
  ticker.hidden = false;
  const label = mdEl("span", "md-ticker-label");
  label.append(mdEl("b", "", "WEEK 1"), " MATCHUPS");
  const msg = mdEl("div", "md-ticker-viewport md-ticker-empty");
  msg.append("The schedule hasn't been set yet. ", link("admin-schedule.html", "Import it in Admin › Schedule Import"));
  ticker.replaceChildren(label, msg);
  // Game of the Week
  const gotw = document.querySelector("#md-gotw");
  gotw.hidden = false;
  gotw.style.removeProperty("--md-away");
  gotw.style.removeProperty("--md-home");
  const head = mdEl("div", "md-gotw-head");
  const title = mdEl("strong", "md-gotw-title");
  title.append(mdEl("span", "md-gotw-week", "WEEK 1"), mdEl("span", "md-gotw-divider", "|"), mdEl("span", "", "GAME OF THE WEEK"));
  head.append(title, mdEl("span", "md-gotw-date", "TO BE ANNOUNCED"));
  const tbd = (side) => {
    const panel = mdEl("div", `md-gotw-side is-${side} is-tbd`);
    const photo = mdEl("span", "md-gotw-photo is-logo");
    photo.append(mdEl("span", "leader-logo", "?"));
    const team = mdEl("span", "md-gotw-team");
    team.append(mdEl("b", "", "TBD"), mdEl("span", "", "0-0"));
    panel.append(photo, mdEl("div", "md-gotw-name"), team);
    return panel;
  };
  const center = mdEl("div", "md-gotw-vs");
  center.append(mdEl("strong", "md-gotw-vs-text", "VS"), mdEl("span", "", "TBD @ TBD"));
  const stage = mdEl("div", "md-gotw-stage");
  stage.append(tbd("away"), center, tbd("home"));
  const strip = mdEl("div", "md-gotw-notes");
  strip.append(mdEl("span", "", "PICKED FROM THE SCHEDULE ONCE IT'S IMPORTED"));
  gotw.replaceChildren(head, stage, strip);
  // Scoreboard
  const board = document.querySelector("#md-board");
  if (board) {
    board.hidden = false;
    const bhead = mdEl("div", "md-board-head");
    bhead.append(mdEl("h3", "md-board-title", "Scoreboard"));
    const toggle = mdEl("div", "md-board-toggle");
    const tab = mdEl("button", "md-board-tab is-active", "Week 1");
    tab.type = "button";
    tab.disabled = true;
    toggle.append(tab);
    bhead.append(toggle);
    const list = mdEl("ol", "md-board-list");
    const empty = mdEl("li", "md-board-empty", "No games scheduled yet. ");
    empty.append(link("admin-schedule.html", "Import the schedule"));
    list.append(empty);
    board.replaceChildren(bhead, list);
  }
  renderWeekSlate([], null, {});
  renderWeeksBest(games);
}

renderMatchday();
window.addEventListener("storage", (event) => { if (event.key === officeStorageKey) renderMatchday(); });


// ---------- Game preview pop-out (from a Week Games pane) ----------
// Both teams' last 5 games, head to head, and projected starters from each depth chart (falling back to the salary
// sheet by position): away defense vs home offense, with a switch for away offense vs home defense.
const mdOffenseSlots = [["QB", 1], ["HB", 1], ["WR", 3], ["TE", 1], ["LT", 1], ["LG", 1], ["C", 1], ["RG", 1], ["RT", 1]];
const mdDefenseSlots = [["LE", 1], ["DT", 2], ["RE", 1], ["SAM", 1], ["MIKE", 1], ["WILL", 1], ["CB", 2], ["FS", 1], ["SS", 1]];
const mdSlotFits = {
  QB: ["QB"], HB: ["HB", "RB"], WR: ["WR"], TE: ["TE"], LT: ["LT", "OT", "T", "OL"], RT: ["RT", "OT", "T", "OL"],
  LG: ["LG", "OG", "G", "IOL", "OL"], RG: ["RG", "OG", "G", "IOL", "OL"], C: ["C", "IOL", "OL"],
  LE: ["LE", "DE", "EDGE", "ED"], RE: ["RE", "DE", "EDGE", "ED"], DT: ["DT", "NT", "IDL", "DL"],
  SAM: ["SAM", "OLB", "LB"], MIKE: ["MIKE", "MLB", "ILB", "LB"], WILL: ["WILL", "OLB", "LB"],
  CB: ["CB", "DB"], FS: ["FS", "S", "SAF", "DB"], SS: ["SS", "S", "SAF", "DB"]
};

// [{ slot, label, player|null }] for one side of the ball.
function mdStarters(teamId, side) {
  const year = seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
  const chart = mdData.depthCharts?.[teamId]?.slots || {};
  const roster = (mdData.teams[teamId]?.roster || []).filter((p) => isPlayerOnSeason(p, year) && !(isPracticeSquad(seasonEntry(p, year)) && !isPsElevated(seasonEntry(p, year))));
  const used = new Set();
  const rows = [];
  for (const [slot, count] of side === "offense" ? mdOffenseSlots : mdDefenseSlots) {
    for (let i = 0; i < count; i += 1) {
      let player = null;
      const id = (chart[slot] || [])[i];
      if (id) player = roster.find((p) => p.id === id) || null;
      if (!player) {
        // Not on the depth chart: the best fit by position, highest cap hit first.
        const fits = mdSlotFits[slot] || [slot];
        player = roster.filter((p) => !used.has(p.id) && fits.includes(String(seasonEntry(p, year).position || "").toUpperCase().split(/[\s/,-]+/)[0]))
          .sort((a, b) => fits.indexOf(String(seasonEntry(a, year).position).toUpperCase()) - fits.indexOf(String(seasonEntry(b, year).position).toUpperCase()) ||
            capHitFor(seasonEntry(b, year)) - capHitFor(seasonEntry(a, year)))[0] || null;
      }
      if (player) used.add(player.id);
      rows.push({ slot, label: count > 1 ? `${slot}${i + 1}` : slot, player, fromChart: Boolean(id && player && player.id === id) });
    }
  }
  return rows;
}

// A team's most recent games (box scores) before a week: [{ game, me, them, home }]
function mdRecentGames(teamId, beforeWeek, limit = 5) {
  return (mdData.games || []).filter((g) => g.teams?.length === 2 && g.teams.some((t) => t.team === teamId) && (beforeWeek == null || (g.week ?? 0) < beforeWeek))
    .sort((a, b) => (b.week ?? 0) - (a.week ?? 0) || String(b.date).localeCompare(String(a.date))).slice(0, limit)
    .map((g) => ({ game: g, me: g.teams.find((t) => t.team === teamId), them: g.teams.find((t) => t.team !== teamId), home: g.teams[1].team === teamId }));
}

function mdPreviewTeamCard(teamId, records, beforeWeek) {
  const [base] = teamThemePalettes[teamId] || ["#0c2b50"];
  const card = mdEl("section", "mdp-team");
  card.style.setProperty("--mdp-team", base);
  const head = mdEl("div", "mdp-team-head");
  const name = mdEl("a", "mdp-team-name");
  name.href = `team.html?team=${encodeURIComponent(teamId)}`;
  name.append(overviewLogo(teamId), mdEl("b", "", (teamName(teamId) || teamId).toUpperCase()));
  head.append(name, mdEl("strong", "mdp-team-record", mdRecordText(records[teamId])));
  card.append(head);
  const recent = mdRecentGames(teamId, beforeWeek);
  if (!recent.length) card.append(mdEl("p", "mdp-muted", "No games played yet."));
  else {
    card.append(mdEl("p", "mdp-sub", `Last ${recent.length} game${recent.length === 1 ? "" : "s"}`));
    const list = mdEl("ol", "mdp-recent");
    for (const r of recent) {
      const result = r.me.score > r.them.score ? "W" : r.me.score < r.them.score ? "L" : "T";
      const li = mdEl("li");
      li.append(mdEl("b", `mdp-result is-${result.toLowerCase()}`, result), mdEl("span", "", `${r.me.score}–${r.them.score} ${r.home ? "vs" : "@"} ${r.them.team}`),
        mdEl("small", "", r.game.week ? (r.game.week > 18 ? mdWeekName(r.game.week) : `Week ${r.game.week}`) : ""));
      list.append(li);
    }
    card.append(list);
  }
  return card;
}

function mdHeadToHead(away, home, beforeWeek) {
  const all = (typeof archivedGames === "function" ? archivedGames(mdData) : [])
    .filter((g) => [g.away, g.home].includes(away) && [g.away, g.home].includes(home) && Number.isFinite(g.awayScore) && Number.isFinite(g.homeScore));
  const wins = { [away]: 0, [home]: 0 }, playoff = { [away]: 0, [home]: 0 };
  for (const g of all) {
    if (g.awayScore === g.homeScore) continue;
    const w = g.awayScore > g.homeScore ? g.away : g.home;
    wins[w] += 1;
    if (g.week > 18) playoff[w] += 1;
  }
  const leads = (r) => r[away] === r[home] ? (r[away] ? `Tied ${r[away]}–${r[home]}` : "No games yet") : r[away] > r[home] ? `${away} leads ${r[away]}–${r[home]}` : `${home} leads ${r[home]}–${r[away]}`;
  const season = mdSeason(mdData);
  const thisSeason = all.filter((g) => (!season || g.season === season) && (beforeWeek == null || (g.week ?? 0) < beforeWeek));
  const last = [...all].sort((a, b) => (b.season - a.season) || ((b.week ?? 0) - (a.week ?? 0)))[0];
  const box = mdEl("section", "mdp-card mdp-h2h");
  box.append(mdEl("h3", "", "HEAD TO HEAD"));
  const dl = mdEl("dl");
  const row = (k, v) => dl.append(mdEl("dt", "", k), mdEl("dd", "", v));
  row("All-time", leads(wins));
  row("Playoffs", playoff[away] + playoff[home] ? leads(playoff) : "No playoff meetings");
  row("This season", thisSeason.length ? thisSeason.map((g) => `${g.away} ${g.awayScore} @ ${g.home} ${g.homeScore}`).join(" · ") : "First meeting");
  row("Last meeting", last ? `${last.season}${last.week ? ` Week ${last.week}` : ""}: ${last.away} ${last.awayScore} @ ${last.home} ${last.homeScore}` : "—");
  box.append(dl);
  return box;
}

function mdStarterColumn(teamId, side) {
  const col = mdEl("section", "mdp-card mdp-starters");
  const [base] = teamThemePalettes[teamId] || ["#0c2b50"];
  col.style.setProperty("--mdp-team", base);
  const h = mdEl("h3");
  h.append(overviewLogo(teamId), `${teamId} ${side === "offense" ? "OFFENSE" : "DEFENSE"}`);
  col.append(h);
  const rows = mdStarters(teamId, side);
  const list = mdEl("ol", "mdp-starter-list");
  for (const r of rows) {
    const li = mdEl("li");
    li.append(mdEl("span", "mdp-pos", r.label));
    if (r.player) {
      const a = mdEl("a", "mdp-player", r.player.name);
      a.href = profileUrl(r.player.id);
      // His season so far, from the logged box scores (regular season).
      const totals = typeof seasonBoxScoreStats === "function" ? seasonBoxScoreStats(mdData, r.player.name) : null;
      const lines = totals ? mdLines(totals.values) : [];
      const lineman = ["LT", "LG", "C", "RG", "RT"].includes(r.slot); // box scores don't track offensive linemen
      const who = mdEl("div", "mdp-who");
      const stats = mdEl("span", "mdp-stats", lines[0] || (lineman ? "" : "No stats yet"));
      if (lines.length) stats.title = `${lines.join(" · ")}${totals.games ? ` (${totals.games} game${totals.games === 1 ? "" : "s"})` : ""}`;
      who.append(a, stats);
      li.append(typeof playerPortrait === "function" ? playerPortrait(r.player) : "", who);
    } else li.append(mdEl("span"), mdEl("span", "mdp-muted", "—"));
    list.append(li);
  }
  col.append(list);
  if (!rows.some((r) => r.fromChart)) col.append(mdEl("p", "mdp-note", "No depth chart set: picked from the salary sheet by position."));
  return col;
}

function openGamePreview(item, week) {
  document.querySelector("#md-preview")?.remove();
  const records = mdRecords(mdData);
  const { away, home } = item;
  const g = item.game;
  const dialog = document.createElement("dialog");
  dialog.id = "md-preview";
  dialog.className = "md-preview";
  dialog.setAttribute("aria-label", `${away} at ${home} preview`);
  const close = mdEl("button", "mdp-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close preview");
  close.addEventListener("click", () => dialog.close());
  // Title: logos, AWAY @ HOME (with the final score once played)
  const title = mdEl("header", "mdp-title");
  const h = mdEl("h2");
  const score = (id) => g ? ` ${g.teams.find((t) => t.team === id)?.score}` : "";
  h.append(overviewLogo(away), mdEl("b", "", `${away}${score(away)}`), mdEl("span", "mdp-at", "@"), overviewLogo(home), mdEl("b", "", `${home}${score(home)}`));
  const sched = (mdData.schedule || []).find((s) => s.week === week && s.away === away && s.home === home);
  title.append(h, mdEl("p", "mdp-sub", [week ? (week > 18 ? mdWeekName(week) : `Week ${week}`) : "", g ? "Final" : "Preview", sched?.note || ""].filter(Boolean).join(" · ")));
  // Team cards with the last 5 games
  const teams = mdEl("div", "mdp-grid");
  teams.append(mdPreviewTeamCard(away, records, g ? g.week : week), mdPreviewTeamCard(home, records, g ? g.week : week));
  // Projected starters with the matchup switch
  const startersHead = mdEl("div", "mdp-starters-head");
  startersHead.append(mdEl("h3", "", "PROJECTED STARTERS"));
  const toggle = mdEl("label", "mdp-switch");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  const caption = mdEl("span", "mdp-switch-text");
  toggle.append(input, mdEl("span", "mdp-switch-track"), caption);
  startersHead.append(toggle);
  const starters = mdEl("div", "mdp-grid");
  const drawStarters = () => {
    const swapped = input.checked;
    caption.textContent = swapped ? `${away} offense vs ${home} defense` : `${away} defense vs ${home} offense`;
    starters.replaceChildren(mdStarterColumn(away, swapped ? "offense" : "defense"), mdStarterColumn(home, swapped ? "defense" : "offense"));
  };
  input.addEventListener("change", drawStarters);
  drawStarters();
  const body = mdEl("div", "mdp-body");
  body.append(title, teams, mdHeadToHead(away, home, g ? g.week : week), startersHead, starters);
  dialog.append(close, body);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
