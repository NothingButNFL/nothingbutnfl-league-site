// Box score page: boxscore.html?id=<game id>. One game from Season Stats (data.games): the final score, the two
// teams' stats side by side, and each team's passing, rushing, receiving, defense and kicking lines. Player names link
// to their profiles when the site knows them. Opened from the score ticker on the home page. Uses league-core.js.
(function boxScorePage() {
  const gameId = new URLSearchParams(location.search).get("id") || "";
  const hero = document.querySelector("#bx-hero");
  const body = document.querySelector("#bx-body");
  let data = emptyOfficeData();
  try { data = readStoredOffice() || emptyOfficeData(); } catch { /* show "not found" */ }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function logo(teamId) {
    const team = nflTeams.find(({ id }) => id === teamId);
    const box = el("span", "bx-logo");
    const img = el("img");
    img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team?.logo || teamId.toLowerCase()}.png`;
    img.alt = "";
    img.addEventListener("error", () => { img.remove(); box.textContent = teamId; }, { once: true });
    box.append(img);
    return box;
  }
  function playerLink(name, teamId) {
    const found = typeof findPlayerByName === "function" ? findPlayerByName(data, name, teamId) : null;
    if (!found) return el("span", "", name);
    const a = el("a", "bx-player", name);
    a.href = profileUrl(found.player.id);
    return a;
  }
  const num = (v) => (v === undefined || v === null || v === "" ? "—" : String(v));

  function render() {
    const game = (data.games || []).find((g) => g.id === gameId);
    if (!game) {
      hero.replaceChildren(el("h1", "", "Game not found"), el("p", "team-page-subtitle", "This game isn't in Season Stats in this browser. Open a box score from the score ticker on the home page."));
      body.hidden = true;
      return;
    }
    const [away, home] = game.teams;
    const top = Math.max(away.score, home.score);
    document.title = `${away.team} ${away.score}, ${home.team} ${home.score} — Box Score — Nothing But NFL`;
    // ---- game strip (ESPN-style): away logo/name/score · FINAL · home score/name/logo ----
    const strip = el("div", "bx-strip");
    const side = (t, i) => {
      const box = el("a", `bx-strip-team${i ? " is-home" : ""}${t.score === top && away.score !== home.score ? " is-winner" : ""}`);
      box.href = `team.html?team=${encodeURIComponent(t.team)}`;
      const name = el("span", "bx-strip-name");
      name.append(el("strong", "", teamName(t.team)), el("small", "", i ? "Home" : "Away"));
      const pts = el("b", "bx-strip-score", String(t.score));
      if (i) box.append(pts, name, logo(t.team)); else box.append(logo(t.team), name, pts);
      return box;
    };
    const mid = el("div", "bx-strip-mid");
    mid.append(el("strong", "", "FINAL"), el("small", "", [game.week ? (game.week > 18 ? "Playoffs" : `Week ${game.week}`) : "", game.date ? new Date(`${game.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""].filter(Boolean).join(" · ")));
    strip.append(side(away, 0), mid, side(home, 1));
    hero.replaceChildren(strip, el("p", "bx-title", `${teamName(away.team)} @ ${teamName(home.team)}`));

    // ---- player stats: one section per category, the two teams side by side, each with a TEAM row ----
    const sum = (lines, k) => lines.reduce((t, l) => t + (Number(l[k]) || 0), 0);
    const maxOf = (lines, k) => (lines.some((l) => l[k] != null) ? Math.max(...lines.map((l) => Number(l[k]) || 0)) : undefined);
    const sumIf = (lines, k) => (lines.some((l) => l[k] != null) ? sum(lines, k) : undefined); // "—" when nobody has it
    const avg = (a, b) => (b ? (a / b).toFixed(1) : "0.0");
    const rating = (l) => { // NFL passer rating
      const att = Number(l.att) || 0; if (!att) return undefined;
      const c = (v) => Math.max(0, Math.min(2.375, v));
      const r = (c((l.cmp / att - 0.3) * 5) + c((l.yds / att - 3) * 0.25) + c((l.td / att) * 20) + c(2.375 - (l.int / att) * 25)) / 6 * 100;
      return r.toFixed(1);
    };
    const cats = [
      ["passing", "Passing", [["RATING", rating], ["YARDS", (l) => l.yds], ["TD", (l) => l.td], ["INT", (l) => l.int], ["LONG", (l) => l.long], ["SACKS", (l) => l.sacks],
        ["COMP", (l) => l.cmp], ["ATT", (l) => l.att], ["COMP%", (l) => (Number(l.att) ? ((l.cmp / l.att) * 100).toFixed(1) : "0.0")], ["YPA", (l) => avg(l.yds, l.att)]],
        (ls) => ({ cmp: sum(ls, "cmp"), att: sum(ls, "att"), yds: sum(ls, "yds"), td: sum(ls, "td"), int: sum(ls, "int"), long: maxOf(ls, "long"), sacks: sumIf(ls, "sacks") })],
      ["rushing", "Rushing", [["ATT", (l) => l.att], ["YARDS", (l) => l.yds], ["AVG", (l) => avg(l.yds, l.att)], ["TD", (l) => l.td], ["FUMB", (l) => l.fumb], ["BTK", (l) => l.btk], ["YAC", (l) => l.yac], ["LONG", (l) => l.long]],
        (ls) => ({ att: sum(ls, "att"), yds: sum(ls, "yds"), td: sum(ls, "td"), fumb: sumIf(ls, "fumb"), btk: sumIf(ls, "btk"), yac: sumIf(ls, "yac"), long: maxOf(ls, "long") })],
      ["receiving", "Receiving", [["REC", (l) => l.rec], ["YDS", (l) => l.yds], ["AVG", (l) => avg(l.yds, l.rec)], ["TD", (l) => l.td], ["LONG", (l) => l.long]],
        (ls) => ({ rec: sum(ls, "rec"), yds: sum(ls, "yds"), td: sum(ls, "td"), long: maxOf(ls, "long") })],
      ["defense", "Defense", [["TOT", (l) => l.tackles], ["TFL", (l) => l.tfl], ["SACKS", (l) => l.sacks], ["INT", (l) => l.int], ["PD", (l) => l.pd], ["FF", (l) => l.ff], ["FR", (l) => l.fr], ["TD", (l) => l.td]],
        (ls) => ({ tackles: sum(ls, "tackles"), tfl: sum(ls, "tfl"), sacks: sum(ls, "sacks"), int: sum(ls, "int"), pd: sum(ls, "pd"), ff: sum(ls, "ff"), fr: sum(ls, "fr"), td: sum(ls, "td") })],
      ["kicking", "Kicking", [["FG", (l) => `${num(l.fgm)}/${num(l.fga)}`], ["PCT", (l) => (l.fga ? ((l.fgm / l.fga) * 100).toFixed(1) : "0.0")], ["LONG", (l) => l.long], ["XP", (l) => `${num(l.xpm)}/${num(l.xpa)}`], ["PTS", (l) => (Number(l.fgm) || 0) * 3 + (Number(l.xpm) || 0)]],
        (ls) => ({ fgm: sum(ls, "fgm"), fga: sum(ls, "fga"), xpm: sum(ls, "xpm"), xpa: sum(ls, "xpa"), long: maxOf(ls, "long") })],
    ];
    const players = document.querySelector("#bx-players");
    const parts = [];
    const place = (id) => teamName(id).replace(/\s+\S+$/, ""); // "Las Vegas Raiders" → "Las Vegas"
    for (const [key, title, cols, total] of cats) {
      const lines = game.players?.[key] || [];
      if (!lines.length) continue;
      const pair = el("div", "bx-pair");
      for (const t of [away, home]) {
        const mine = lines.filter((l) => l.team === t.team);
        const block = el("div", "bx-block");
        const head = el("div", "bx-block-head");
        head.append(logo(t.team), el("span", "", `${place(t.team)} ${title}`));
        block.append(head);
        const table = el("table", `bx-table bx-cat-${key}`);
        const hr = table.createTHead().insertRow();
        hr.append(el("th", "bx-name-col", "PLAYER NAME"), ...cols.map(([h]) => el("th", "", h)));
        const tb = table.createTBody();
        if (!mine.length) {
          const tr = tb.insertRow();
          const td = tr.insertCell();
          td.colSpan = cols.length + 1;
          td.className = "bx-none";
          td.textContent = `No ${place(t.team)} ${title}`;
        } else {
          for (const line of mine) {
            const tr = tb.insertRow();
            const name = tr.insertCell();
            name.className = "bx-name";
            name.append(playerLink(line.player, t.team));
            for (const [, get] of cols) tr.insertCell().textContent = num(get(line));
          }
          const totals = total(mine);
          const tr = tb.insertRow();
          tr.className = "bx-total";
          const name = tr.insertCell();
          name.className = "bx-name";
          name.textContent = "TEAM";
          for (const [h, get] of cols) tr.insertCell().textContent = h === "RATING" ? "" : num(get(totals));
        }
        block.append(table);
        pair.append(block);
      }
      parts.push(pair);
    }
    players.replaceChildren(...(parts.length ? parts : [el("p", "empty-state", "Only the final score was entered for this game, so there are no player stats.")]));

    // ---- team stats: label, then each team's number (like ESPN's Team Stats) ----
    const ts = game.teamStats || {};
    const box = document.querySelector("#bx-team-stats");
    // [label, value, key for the better-side marker (3rd down efficiency compares the conversion rate)]
    const rows = [
      ["Off Yards Gained", (s) => s.totalOffense, "totalOffense"], ["Off Rush Yards", (s) => s.rushYds, "rushYds"],
      ["Off Pass Yards", (s) => s.passYds, "passYds"], ["Off First Downs", (s) => s.firstDowns, "firstDowns"],
      ["Punt Return Yards", (s) => s.puntReturnYds, "puntReturnYds"], ["Kick Return Yards", (s) => s.kickReturnYds, "kickReturnYds"],
      ["Total Yards Gained", (s) => s.totalYds, "totalYds"], ["Turnovers", (s) => s.turnovers, "turnovers"],
      ["Third Down Conversions", (s) => s.thirdConv, "thirdConv"],
      ["Fourth Down Conversions", (s) => s.fourthConv, "fourthConv"],
      ["Two Point Conversions", (s) => s.twoPtConv, "twoPtConv"],
      ["Red Zone Off Percentage", (s) => (s.redZonePct != null ? `${num(s.redZonePct)}%` : undefined), "redZonePct"],
      ["Red Zone Off TD", (s) => s.redZoneTd, "redZoneTd"], ["Red Zone Off FG", (s) => s.redZoneFg, "redZoneFg"],
      ["Penalty Yards", (s) => s.penaltyYds, "penaltyYds"], ["Time of Possession", (s) => s.possession, "possession"],
    ].filter(([, get]) => [away, home].some((t) => get(ts[t.team] || {}) !== undefined));
    if (!rows.length) {
      box.replaceChildren(el("p", "empty-state", "Only the final score was entered for this game, so there are no team stats."));
    } else {
      // Away team's number on the left, the stat in the middle, the home team's on the right.
      const table = el("table", "bx-table bx-team-table");
      const hr = table.createTHead().insertRow();
      const teamHead = (t, cls) => { const th = el("th", cls); const w = el("span", "bx-th-team"); w.append(logo(t.team), el("span", "", teamName(t.team))); th.append(w); return th; };
      hr.append(teamHead(away, "bx-ts-away"), el("th", "bx-ts-label", ""), teamHead(home, "bx-ts-home"));
      const tb = table.createTBody();
      for (const [label, get, key] of rows) {
        const tr = tb.insertRow();
        const values = [away, home].map((t) => get(ts[t.team] || {}));
        const best = betterSide(key, ts[away.team]?.[key], ts[home.team]?.[key]);
        const a = tr.insertCell(); a.className = "bx-ts-away";
        if (best === "away") a.append(edge("away"), " ");
        a.append(num(values[0]));
        const l = tr.insertCell(); l.className = "bx-ts-label"; l.textContent = label;
        const h = tr.insertCell(); h.className = "bx-ts-home"; h.append(num(values[1]));
        if (best === "home") h.append(" ", edge("home"));
      }
      box.replaceChildren(table);
    }
  }

  // Which side has the better number for a team stat: "away", "home" or "" (tied, missing, or not a "better" stat).
  const lowerIsBetter = new Set(["penalties", "penaltyYds", "turnovers", "fumblesLost", "interceptions"]);
  const noBest = new Set(["thirdAtt", "fourthAtt", "twoPtAtt", "redZoneFg"]);
  const toSec = (v) => { const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  function betterSide(key, a, b) {
    if (noBest.has(key)) return "";
    const x = key === "possession" ? toSec(a) : (a === "" || a == null ? null : Number(a));
    const y = key === "possession" ? toSec(b) : (b === "" || b == null ? null : Number(b));
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y) || x === y) return "";
    return (lowerIsBetter.has(key) ? x < y : x > y) ? "away" : "home";
  }
  // The edge marker: ">" left of the away number, "<" right of the home number.
  const edge = (side) => el("span", `bx-edge is-${side}`, side === "away" ? ">" : "<");

  // ---------- Editing: score, week, date, every player line and the team stats ----------
  // Player lines feed Season Stats, Career Stats, leaders and the Player Hub straight away (they're added up from the
  // box scores); a changed score also updates both teams' records in the standings.
  const editBtn = document.querySelector("#bx-edit-btn");
  // While editing, Save and Cancel take the Edit button's spot at the top (and stay at the bottom too).
  const topActions = document.querySelector("#bx-top-actions");
  document.querySelector("#bx-top-cancel").addEventListener("click", () => closeEditor());
  const editor = document.querySelector("#bx-editor");
  const status = document.querySelector("#bx-status");
  const editFields = {
    passing: [["yds", "YARDS"], ["td", "TD"], ["int", "INT"], ["long", "LONG"], ["sacks", "SACKS"], ["cmp", "COMP"], ["att", "ATT"]],
    rushing: [["att", "ATT"], ["yds", "YARDS"], ["td", "TD"], ["fumb", "FUMB"], ["btk", "BTK"], ["yac", "YAC"], ["long", "LONG"]],
    receiving: [["rec", "REC"], ["yds", "YDS"], ["td", "TD"], ["long", "LONG"]],
    defense: [["tackles", "TOT"], ["tfl", "TFL"], ["sacks", "SACKS"], ["int", "INT"], ["pd", "PD"], ["ff", "FF"], ["fr", "FR"], ["td", "TD"]],
    kicking: [["fgm", "FGM"], ["fga", "FGA"], ["xpm", "XPM"], ["xpa", "XPA"], ["long", "LONG"]],
  };
  const catTitles = { passing: "Passing", rushing: "Rushing", receiving: "Receiving", defense: "Defense", kicking: "Kicking" };
  // Same order as the Team Stats table.
  const teamFields = [["totalOffense", "Off Yards Gained"], ["rushYds", "Off Rush Yards"], ["passYds", "Off Pass Yards"], ["firstDowns", "Off First Downs"],
    ["puntReturnYds", "Punt Return Yards"], ["kickReturnYds", "Kick Return Yards"], ["totalYds", "Total Yards Gained"], ["turnovers", "Turnovers"],
    ["thirdConv", "Third Down Conversions"], ["fourthConv", "Fourth Down Conversions"], ["twoPtConv", "Two Point Conversions"], ["redZonePct", "Red Zone Off %"], ["redZoneTd", "Red Zone Off TD"],
    ["redZoneFg", "Red Zone Off FG"], ["penaltyYds", "Penalty Yards"], ["possession", "Time of Possession (MM:SS)"]];

  function numberInput(value, label, step = "1") {
    const i = el("input");
    i.type = "number"; i.step = step; i.min = "-99"; i.max = "9999";
    i.value = value ?? "";
    i.setAttribute("aria-label", label);
    return i;
  }
  // Names on the team's roster this season, for the name box's suggestions.
  function rosterList(teamId) {
    const id = `bx-roster-${teamId}`;
    if (document.getElementById(id)) return id;
    const list = el("datalist");
    list.id = id;
    for (const p of data.teams?.[teamId]?.roster || []) list.append(Object.assign(document.createElement("option"), { value: p.name }));
    document.body.append(list);
    return id;
  }
  function lineRow(cat, teamId, line = {}) {
    const tr = el("tr");
    tr.dataset.team = teamId;
    tr._line = line;
    const name = el("input", "bx-edit-name");
    name.type = "text"; name.maxLength = 70; name.value = line.player || ""; name.placeholder = "Player name";
    name.setAttribute("list", rosterList(teamId));
    name.setAttribute("aria-label", `${catTitles[cat]} player`);
    tr.insertCell().append(name);
    for (const [key, label] of editFields[cat]) tr.insertCell().append(numberInput(line[key], `${label} for ${line.player || "new player"}`, key === "sacks" || key === "tfl" ? "0.5" : "1"));
    const rm = el("button", "row-delete", "×");
    rm.type = "button";
    rm.setAttribute("aria-label", "Remove this line");
    rm.addEventListener("click", () => tr.remove());
    tr.insertCell().append(rm);
    return tr;
  }

  function openEditor() {
    const game = (data.games || []).find((g) => g.id === gameId);
    if (!game) return;
    const [away, home] = game.teams;
    const form = el("form", "bx-editor-form");
    form.id = "bx-editor-form";
    form.noValidate = true;
    // Score, week, date
    const top = el("div", "bx-card bx-edit-top");
    top.append(el("h3", "bx-card-title", "Edit box score"));
    const row = el("div", "bx-edit-meta");
    const scoreBox = (t, label) => { const l = el("label"); l.append(`${label} · ${teamName(t.team)}`, numberInput(t.score, `${t.team} score`)); l.querySelector("input").name = `score-${t.team}`; l.querySelector("input").min = "0"; l.querySelector("input").max = "200"; return l; };
    const weekL = el("label"); weekL.append("Week", numberInput(game.week, "Week")); weekL.querySelector("input").name = "week"; weekL.querySelector("input").min = "0"; weekL.querySelector("input").max = "30";
    const dateL = el("label"); const date = el("input"); date.type = "date"; date.name = "date"; date.value = String(game.date || "").slice(0, 10); dateL.append("Date", date);
    row.append(scoreBox(away, "Away"), scoreBox(home, "Home"), weekL, dateL);
    top.append(row, el("p", "hs-help", "Changes to player lines update Season Stats, Career Stats, leaders and team pages as soon as you save. Changing the score also updates both teams' records in the standings."));
    form.append(top);
    // Player lines, per category, per team
    const cats = el("div", "bx-card");
    cats.append(el("h3", "bx-card-title", "Player stats"));
    for (const cat of boxScoreCategories) {
      const pair = el("div", "bx-pair");
      for (const t of [away, home]) {
        const block = el("div", "bx-block");
        const head = el("div", "bx-block-head");
        head.append(logo(t.team), el("span", "", `${teamName(t.team).replace(/\s+\S+$/, "")} ${catTitles[cat]}`));
        const table = el("table", "bx-table bx-edit-table");
        table.dataset.cat = cat;
        table.dataset.team = t.team;
        const hr = table.createTHead().insertRow();
        hr.append(el("th", "bx-name-col", "PLAYER NAME"), ...editFields[cat].map(([, l]) => el("th", "", l)), el("th", "", ""));
        const tb = table.createTBody();
        for (const line of (game.players?.[cat] || []).filter((l) => l.team === t.team)) tb.append(lineRow(cat, t.team, line));
        const add = el("button", "workspace-button bx-add-line", "+ Add player");
        add.type = "button";
        add.addEventListener("click", () => { const r = lineRow(cat, t.team); tb.append(r); r.querySelector("input").focus(); });
        block.append(head, table, add);
        pair.append(block);
      }
      cats.append(pair);
    }
    form.append(cats);
    // Team stats
    const tsCard = el("div", "bx-card");
    tsCard.append(el("h3", "bx-card-title", "Team stats"));
    // Away number on the left, the stat in the middle, home number on the right; > or < marks the better side.
    const tsTable = el("table", "bx-table bx-edit-team");
    const th = tsTable.createTHead().insertRow();
    th.append(el("th", "bx-ts-away", teamName(away.team)), el("th", "bx-ts-label", ""), el("th", "bx-ts-home", teamName(home.team)));
    const tsb = tsTable.createTBody();
    for (const [key, label] of teamFields) {
      const tr = tsb.insertRow();
      tr.dataset.key = key;
      const inputs = [away, home].map((t) => {
        const v = game.teamStats?.[t.team]?.[key];
        let input;
        if (key === "possession") { input = el("input"); input.type = "text"; input.maxLength = 5; input.placeholder = "30:00"; input.value = v ?? ""; input.setAttribute("aria-label", `${t.team} ${label}`); }
        else input = numberInput(v, `${t.team} ${label}`, key === "redZonePct" ? "any" : "1");
        input.dataset.team = t.team;
        return input;
      });
      const awayCell = tr.insertCell(); awayCell.className = "bx-ts-away";
      const labelCell = tr.insertCell(); labelCell.className = "bx-ts-label"; labelCell.textContent = label;
      const homeCell = tr.insertCell(); homeCell.className = "bx-ts-home";
      const awayWrap = el("span", "bx-edge-wrap"), homeWrap = el("span", "bx-edge-wrap");
      // The inputs are placed once; typing only flips the markers, so the box you're typing in keeps focus.
      const awayEdge = edge("away"), homeEdge = edge("home");
      awayWrap.append(awayEdge, inputs[0]);
      homeWrap.append(inputs[1], homeEdge);
      const mark = () => {
        const side = betterSide(key, inputs[0].value.trim(), inputs[1].value.trim());
        awayEdge.classList.toggle("is-blank", side !== "away");
        homeEdge.classList.toggle("is-blank", side !== "home");
      };
      inputs.forEach((i) => i.addEventListener("input", mark));
      mark();
      awayCell.append(awayWrap);
      homeCell.append(homeWrap);
    }
    tsCard.append(tsTable);
    form.append(tsCard);
    const actions = el("div", "bx-edit-actions");
    const save = el("button", "button button-lime", "Save box score"); save.type = "submit";
    const cancel = el("button", "workspace-button", "Cancel"); cancel.type = "button";
    cancel.addEventListener("click", closeEditor);
    actions.append(save, cancel);
    form.append(actions);
    form.addEventListener("submit", (event) => { event.preventDefault(); saveEditor(form); });
    editor.replaceChildren(form);
    editor.hidden = false;
    body.hidden = true;
    editBtn.hidden = true;
    topActions.hidden = false;
    status.textContent = "";
    editBtn.closest(".bx-edit-bar").scrollIntoView({ block: "start" });
  }
  function closeEditor() {
    editor.hidden = true;
    editor.replaceChildren();
    body.hidden = false;
    editBtn.hidden = false;
    topActions.hidden = true;
  }
  const readNum = (input) => { const t = input.value.trim(); if (t === "") return undefined; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

  function saveEditor(form) {
    let fresh;
    try { fresh = readStoredOffice() || data; } catch { status.textContent = "Saved league data couldn't be read, so nothing was changed."; return; }
    const game = (fresh.games || []).find((g) => g.id === gameId);
    if (!game) { status.textContent = "This game isn't in Season Stats any more."; return; }
    const before = game.teams.map((t) => ({ ...t }));
    // Score, week, date
    const scores = game.teams.map((t) => readNum(form.querySelector(`[name="score-${t.team}"]`)));
    if (scores.some((s) => !Number.isInteger(s) || s < 0 || s > 200)) { status.textContent = "Each score must be a whole number from 0 to 200."; return; }
    const week = readNum(form.querySelector('[name="week"]'));
    if (week !== undefined && (!Number.isInteger(week) || week < 0 || week > 30)) { status.textContent = "Week must be a whole number from 0 to 30 (or blank)."; return; }
    const date = form.querySelector('[name="date"]').value;
    // Player lines
    const players = {};
    for (const table of form.querySelectorAll(".bx-edit-table")) {
      const cat = table.dataset.cat;
      for (const tr of table.tBodies[0].rows) {
        const inputs = [...tr.querySelectorAll("input")];
        const name = inputs[0].value.trim();
        const values = editFields[cat].map(([key], i) => [key, readNum(inputs[i + 1])]);
        if (!name && values.every(([, v]) => v === undefined)) continue; // empty new row
        if (!name) { status.textContent = `A ${catTitles[cat].toLowerCase()} line for ${table.dataset.team} has stats but no player name.`; inputs[0].focus(); return; }
        const bad = values.find(([, v]) => Number.isNaN(v));
        if (bad) { status.textContent = `${name}: ${bad[0]} isn't a number.`; return; }
        const line = { ...(tr._line || {}), player: name, team: table.dataset.team };
        if (tr._line?.player && normalizePlayerName(tr._line.player) !== normalizePlayerName(name)) delete line.rawName;
        for (const [key, v] of values) { if (v === undefined) delete line[key]; else line[key] = v; }
        (players[cat] ||= []).push(line);
      }
    }
    // Team stats
    const teamStats = {};
    for (const tr of form.querySelectorAll(".bx-edit-team tbody tr")) {
      for (const input of tr.querySelectorAll("input")) {
        const team = input.dataset.team, key = tr.dataset.key;
        teamStats[team] ||= { ...(game.teamStats?.[team] || {}) };
        if (key === "possession") {
          const v = input.value.trim();
          if (v && !/^\d{1,2}:\d{2}$/.test(v)) { status.textContent = `${team} possession should look like 31:24.`; return; }
          if (v) teamStats[team][key] = v; else delete teamStats[team][key];
        } else {
          const v = readNum(input);
          if (Number.isNaN(v)) { status.textContent = `${team} ${key} isn't a number.`; return; }
          if (v === undefined) delete teamStats[team][key]; else teamStats[team][key] = v;
        }
      }
    }
    for (const team of Object.keys(teamStats)) if (!Object.keys(teamStats[team]).length) delete teamStats[team];
    const updated = { ...game, teams: game.teams.map((t, i) => ({ ...t, score: scores[i] })), players, teamStats };
    if (week === undefined) delete updated.week; else updated.week = week;
    if (date) updated.date = date;
    if (!validGames([updated])) { status.textContent = "Some of those numbers are out of range (each stat must be under 100,000), so nothing was saved."; return; }
    // Standings: take the old result back out and put the new one in.
    const changed = before.some((t, i) => t.score !== scores[i]);
    if (changed && fresh.standings?.teams) {
      const res = (me, them) => (me > them ? "w" : me < them ? "l" : "t");
      for (let i = 0; i < 2; i += 1) {
        const team = before[i].team;
        const rec = { ...teamRecord(fresh, team) };
        const oldR = res(before[i].score, before[1 - i].score), newR = res(scores[i], scores[1 - i]);
        rec[oldR] = Math.max(0, rec[oldR] - 1);
        rec[newR] = Math.min(30, rec[newR] + 1);
        rec.pf = Math.max(0, rec.pf - before[i].score + scores[i]);
        rec.pa = Math.max(0, rec.pa - before[1 - i].score + scores[1 - i]);
        // If this game set the team's current streak, redo it from the result.
        if (oldR !== newR && rec.streak && rec.streak === game.streakAfter?.[team]) {
          const prev = String(game.standingsBefore?.[team]?.streak || "").match(/^([WLT])(\d+)$/);
          const R = newR.toUpperCase();
          rec.streak = prev && prev[1] === R ? `${R}${Number(prev[2]) + 1}` : `${R}1`;
          updated.streakAfter = { ...(updated.streakAfter || {}), [team]: rec.streak };
        }
        fresh.standings.teams[team] = rec;
      }
    }
    fresh.games = fresh.games.map((g) => (g.id === gameId ? updated : g));
    try { writeStoredOffice(fresh); }
    catch (error) { status.textContent = /quota/i.test(`${error.name} ${error.message}`) ? "Browser storage is full, so the changes weren't saved." : `Couldn't save: ${error.message}.`; return; }
    data = fresh;
    closeEditor();
    render();
    const n = Object.values(players).reduce((t, l) => t + l.length, 0);
    status.textContent = `Box score saved: ${n} player line${n === 1 ? "" : "s"}${changed ? "; the score change is in the standings" : ""}. Season Stats now include these numbers.`;
  }
  editBtn.addEventListener("click", openEditor);
  editBtn.hidden = !(data.games || []).some((g) => g.id === gameId);

  window.addEventListener("storage", (event) => {
    if (event.key !== officeStorageKey) return;
    try { data = readStoredOffice() || emptyOfficeData(); } catch { return; }
    render();
  });
  render();
})();
