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
    // ---- score header ----
    const eyebrow = el("p", "eyebrow");
    eyebrow.innerHTML = '<span class="eyebrow-dot"></span> ';
    eyebrow.append(`FINAL · ${game.week ? (game.week > 18 ? "PLAYOFFS" : `WEEK ${game.week}`) : "NO WEEK SET"}${game.date ? ` · ${game.date}` : ""}`);
    const score = el("div", "bx-score");
    [away, home].forEach((side, i) => {
      if (i) score.append(el("span", "bx-at", "@"));
      const t = el("a", `bx-team${side.score === top && away.score !== home.score ? " is-winner" : ""}${i ? " is-home" : ""}`);
      t.href = `team.html?team=${encodeURIComponent(side.team)}`;
      const name = el("span", "bx-team-name");
      name.append(el("strong", "", teamName(side.team)), el("small", "", i ? "HOME" : "AWAY"));
      t.append(logo(side.team), name, el("b", "bx-points", String(side.score)));
      score.append(t);
    });
    hero.replaceChildren(eyebrow, score);

    // ---- team stats ----
    const ts = game.teamStats || {};
    const box = document.querySelector("#bx-team-stats");
    const rows = [
      ["First downs", (s) => s.firstDowns], ["Total yards", (s) => s.totalOffense], ["Total plays", (s) => s.totalPlays],
      ["Passing", (s) => (s.cmp != null || s.att != null ? `${num(s.cmp)}/${num(s.att)}, ${num(s.passYds)} yds` : s.passYds)], ["Passing TD", (s) => s.passTd],
      ["Rushing", (s) => (s.rushAtt != null ? `${num(s.rushAtt)} for ${num(s.rushYds)} yds` : s.rushYds)], ["Rushing TD", (s) => s.rushTd],
      ["Third downs", (s) => (s.thirdAtt != null ? `${num(s.thirdConv)} of ${num(s.thirdAtt)}` : undefined)],
      ["Turnovers", (s) => s.turnovers], ["Interceptions thrown", (s) => s.interceptions], ["Fumbles lost", (s) => s.fumblesLost],
      ["Penalties", (s) => s.penalties], ["Time of possession", (s) => s.possession],
    ].filter(([, get]) => [away, home].some((side) => get(ts[side.team] || {}) !== undefined));
    if (!rows.length) {
      box.replaceChildren(el("p", "empty-state", "Only the final score was entered for this game, so there are no team stats."));
    } else {
      const table = el("table", "management-table bx-team-table");
      const head = table.createTHead().insertRow();
      head.append(el("th", "", "STAT"), el("th", "", away.team), el("th", "", home.team));
      const tb = table.createTBody();
      for (const [label, get] of rows) {
        const tr = tb.insertRow();
        tr.append(el("th", "", label));
        for (const side of [away, home]) tr.insertCell().textContent = num(get(ts[side.team] || {}));
      }
      const wrap = el("div", "management-table-wrap");
      wrap.append(table);
      box.replaceChildren(wrap);
    }

    // ---- player stats ----
    const cats = {
      passing: ["Passing", [["C/ATT", (l) => `${num(l.cmp)}/${num(l.att)}`], ["YDS", (l) => l.yds], ["TD", (l) => l.td], ["INT", (l) => l.int], ["LONG", (l) => l.long]]],
      rushing: ["Rushing", [["CAR", (l) => l.att], ["YDS", (l) => l.yds], ["AVG", (l) => (l.att ? (l.yds / l.att).toFixed(1) : undefined)], ["TD", (l) => l.td], ["LONG", (l) => l.long]]],
      receiving: ["Receiving", [["REC", (l) => l.rec], ["YDS", (l) => l.yds], ["AVG", (l) => (l.rec ? (l.yds / l.rec).toFixed(1) : undefined)], ["TD", (l) => l.td], ["LONG", (l) => l.long]]],
      defense: ["Defense", [["TKL", (l) => l.tackles], ["SACKS", (l) => l.sacks], ["INT", (l) => l.int], ["PD", (l) => l.pd], ["FF", (l) => l.ff], ["FR", (l) => l.fr], ["TD", (l) => l.td]]],
      kicking: ["Kicking", [["FG", (l) => `${num(l.fgm)}/${num(l.fga)}`], ["LONG", (l) => l.long], ["XP", (l) => `${num(l.xpm)}/${num(l.xpa)}`]]],
    };
    const players = document.querySelector("#bx-players");
    const parts = [];
    for (const [key, [title, cols]] of Object.entries(cats)) {
      const lines = game.players?.[key] || [];
      if (!lines.length) continue;
      const section = el("div", "bx-cat");
      section.append(el("h4", "player-subhead", title));
      const pair = el("div", "bx-pair");
      for (const side of [away, home]) {
        const mine = lines.filter((l) => l.team === side.team);
        const col = el("div", "bx-side");
        const label = el("div", "bx-side-head");
        label.append(logo(side.team), el("span", "", teamName(side.team)));
        col.append(label);
        if (!mine.length) { col.append(el("p", "empty-state", "None")); pair.append(col); continue; }
        const table = el("table", "management-table bx-player-table");
        const head = table.createTHead().insertRow();
        head.append(el("th", "", "PLAYER"), ...cols.map(([h]) => el("th", "", h)));
        const tb = table.createTBody();
        for (const line of mine) {
          const tr = tb.insertRow();
          const name = tr.insertCell();
          name.className = "bx-name";
          name.append(playerLink(line.player, side.team));
          for (const [, get] of cols) tr.insertCell().textContent = num(get(line));
        }
        const wrap = el("div", "management-table-wrap");
        wrap.append(table);
        col.append(wrap);
        pair.append(col);
      }
      section.append(pair);
      parts.push(section);
    }
    players.replaceChildren(...(parts.length ? parts : [el("p", "empty-state", "Only the final score was entered for this game, so there are no player stats.")]));
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== officeStorageKey) return;
    try { data = readStoredOffice() || emptyOfficeData(); } catch { return; }
    render();
  });
  render();
})();
