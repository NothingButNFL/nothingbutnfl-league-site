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
    const avg = (a, b) => (b ? (a / b).toFixed(1) : "0.0");
    const rating = (l) => { // NFL passer rating
      const att = Number(l.att) || 0; if (!att) return undefined;
      const c = (v) => Math.max(0, Math.min(2.375, v));
      const r = (c((l.cmp / att - 0.3) * 5) + c((l.yds / att - 3) * 0.25) + c((l.td / att) * 20) + c(2.375 - (l.int / att) * 25)) / 6 * 100;
      return r.toFixed(1);
    };
    const cats = [
      ["passing", "Passing", [["C/ATT", (l) => `${num(l.cmp)}/${num(l.att)}`], ["YDS", (l) => l.yds], ["AVG", (l) => avg(l.yds, l.att)], ["TD", (l) => l.td], ["INT", (l) => l.int], ["LONG", (l) => l.long], ["RTG", rating]],
        (ls) => ({ cmp: sum(ls, "cmp"), att: sum(ls, "att"), yds: sum(ls, "yds"), td: sum(ls, "td"), int: sum(ls, "int"), long: maxOf(ls, "long") })],
      ["rushing", "Rushing", [["CAR", (l) => l.att], ["YDS", (l) => l.yds], ["AVG", (l) => avg(l.yds, l.att)], ["TD", (l) => l.td], ["LONG", (l) => l.long]],
        (ls) => ({ att: sum(ls, "att"), yds: sum(ls, "yds"), td: sum(ls, "td"), long: maxOf(ls, "long") })],
      ["receiving", "Receiving", [["REC", (l) => l.rec], ["YDS", (l) => l.yds], ["AVG", (l) => avg(l.yds, l.rec)], ["TD", (l) => l.td], ["LONG", (l) => l.long]],
        (ls) => ({ rec: sum(ls, "rec"), yds: sum(ls, "yds"), td: sum(ls, "td"), long: maxOf(ls, "long") })],
      ["defense", "Defense", [["TOT", (l) => l.tackles], ["SACKS", (l) => l.sacks], ["INT", (l) => l.int], ["PD", (l) => l.pd], ["FF", (l) => l.ff], ["FR", (l) => l.fr], ["TD", (l) => l.td]],
        (ls) => ({ tackles: sum(ls, "tackles"), sacks: sum(ls, "sacks"), int: sum(ls, "int"), pd: sum(ls, "pd"), ff: sum(ls, "ff"), fr: sum(ls, "fr"), td: sum(ls, "td") })],
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
        const table = el("table", "bx-table");
        const hr = table.createTHead().insertRow();
        hr.append(el("th", "bx-name-col", ""), ...cols.map(([h]) => el("th", "", h)));
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
          for (const [h, get] of cols) tr.insertCell().textContent = h === "RTG" ? "" : num(get(totals));
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
    const rows = [
      ["1st Downs", (s) => s.firstDowns], ["3rd down efficiency", (s) => (s.thirdAtt != null ? `${num(s.thirdConv)}-${num(s.thirdAtt)}` : undefined)],
      ["Total Plays", (s) => s.totalPlays], ["Total Yards", (s) => s.totalOffense],
      ["Passing", (s) => s.passYds], ["Comp/Att", (s) => (s.att != null ? `${num(s.cmp)}/${num(s.att)}` : undefined)], ["Passing TDs", (s) => s.passTd],
      ["Rushing", (s) => s.rushYds], ["Rushing Attempts", (s) => s.rushAtt], ["Rushing TDs", (s) => s.rushTd],
      ["Penalties", (s) => s.penalties], ["Turnovers", (s) => s.turnovers], ["Fumbles lost", (s) => s.fumblesLost], ["Interceptions thrown", (s) => s.interceptions],
      ["Possession", (s) => s.possession],
    ].filter(([, get]) => [away, home].some((t) => get(ts[t.team] || {}) !== undefined));
    if (!rows.length) {
      box.replaceChildren(el("p", "empty-state", "Only the final score was entered for this game, so there are no team stats."));
    } else {
      const table = el("table", "bx-table bx-team-table");
      const hr = table.createTHead().insertRow();
      const teamHead = (t) => { const th = el("th", ""); const w = el("span", "bx-th-team"); w.append(logo(t.team), el("span", "", t.team)); th.append(w); return th; };
      hr.append(el("th", "bx-name-col", "MATCHUP"), teamHead(away), teamHead(home));
      const tb = table.createTBody();
      for (const [label, get] of rows) {
        const tr = tb.insertRow();
        const name = tr.insertCell();
        name.className = "bx-name";
        name.textContent = label;
        for (const t of [away, home]) tr.insertCell().textContent = num(get(ts[t.team] || {}));
      }
      box.replaceChildren(table);
    }
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== officeStorageKey) return;
    try { data = readStoredOffice() || emptyOfficeData(); } catch { return; }
    render();
  });
  render();
})();
