// League History › NBNFL Record Book (record-book.html): the top performances in league history.
//   • Game highs and Rookie game highs: every player line in the logged box scores (Season Stats).
//   • Season highs and Rookie season highs: every season's stat tables in the Career Stats record book
//     (data.careerSeasons, plus the season in progress).
//   • Career highs: those seasons added up (career-core.js), plus the longest field goal made.
// A rookie season is a player's first NFL season: this league year minus his years of experience, else his
// profile's draft year, else the NFL roster snapshot's entry year.
// Uses league-core.js, stat-totals.js and career-core.js.
(function recordBook() {
  let data = emptyOfficeData();
  try { data = readStoredOffice() || emptyOfficeData(); } catch { /* empty book */ }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const TOP = 5;

  // [key, label, box-score category + field, season-table category + spec key, decimals]
  const stats = [
    ["passYds", "Passing Yards", "passing", "yds", "passing", "yds"],
    ["passTd", "Passing TDs", "passing", "td", "passing", "td"],
    ["rushYds", "Rushing Yards", "rushing", "yds", "rushing", "yds"],
    ["rushTd", "Rushing TDs", "rushing", "td", "rushing", "td"],
    ["recYds", "Receiving Yards", "receiving", "yds", "receiving", "yds"],
    ["recTd", "Receiving TDs", "receiving", "td", "receiving", "td"],
    ["rec", "Receptions", "receiving", "rec", "receiving", "rec"],
    ["tkl", "Tackles", "defense", "tackles", "defense", "tkl"],
    ["tfl", "Tackles For Loss", "defense", "tfl", "defense", "tfl", true],
    ["sacks", "Sacks", "defense", "sacks", "defense", "sacks", true],
    ["int", "Interceptions", "defense", "int", "defense", "int"],
    ["fgm", "Field Goals Made", "kicking", "fgm", "kicking", "fgm"],
  ];
  const views = [
    ["game", "Game Highs"], ["season", "Season Highs"], ["career", "Career Highs"], ["rookie-season", "Rookie Season Highs"], ["rookie-game", "Rookie Game Highs"],
  ];
  let view = "game";
  try { const v = localStorage.getItem("nbf-record-view"); if (views.some(([k]) => k === v)) view = v; } catch { /* default */ }
  const fmt = (v, half) => (half ? String(Math.round(v * 2) / 2) : Math.round(v).toLocaleString("en-US"));

  // ---------- Who's who ----------
  const rookieCache = new Map();
  function rookieYear(name, team) {
    const key = `${normalizePlayerName(name)}|${team || ""}`;
    if (rookieCache.has(key)) return rookieCache.get(key);
    let year = null;
    const found = findPlayerByName(data, name, team);
    const p = found?.player;
    if (p && Number.isInteger(p.experience)) year = currentLeagueYear() - p.experience;
    else if (p?.profile?.draftYear) year = p.profile.draftYear;
    else if (typeof matchNflExperience === "function") {
      const m = matchNflExperience(name, p ? playerDisplayPosition?.(p, currentLeagueYear()) || "" : "", team || null);
      if (m.record?.entryYear) year = m.record.entryYear;
      else if (m.record?.draftYear) year = m.record.draftYear;
    }
    rookieCache.set(key, year);
    return year;
  }
  function playerName(name, team) {
    const found = findPlayerByName(data, name, team);
    if (!found) return el("span", "", name);
    const a = el("a", "", name);
    a.href = profileUrl(found.player.id);
    return a;
  }
  const gameSeason = (g) => (/^\d{4}-\d{2}-\d{2}/.test(g.date || "") ? currentLeagueYear(new Date(`${g.date.slice(0, 10)}T12:00:00`)) : (data.standings?.season || currentLeagueYear()));

  // ---------- Collecting entries: { name, team, value, context, link } ----------
  function gameEntries(stat, rookiesOnly) {
    const [, , cat, field] = stat;
    const out = [];
    for (const g of data.games || []) {
      const season = gameSeason(g);
      for (const line of g.players?.[cat] || []) {
        const v = Number(line[field]);
        if (!Number.isFinite(v) || v <= 0) continue;
        if (rookiesOnly && rookieYear(line.player, line.team) !== season) continue;
        const opp = g.teams.find((t) => t.team !== line.team);
        const home = g.teams[1]?.team === line.team;
        out.push({ name: line.player, team: line.team, value: v,
          context: `${season}${g.week ? ` · ${g.week > 18 ? "Playoffs" : `Wk ${g.week}`}` : ""} ${home ? "vs" : "@"} ${opp?.team || ""}`.trim(),
          link: `boxscore.html?id=${encodeURIComponent(g.id)}` });
      }
    }
    return out;
  }
  function seasonEntries(stat, rookiesOnly) {
    const [, , , , cat, key] = stat;
    const spec = crSpec[cat];
    const col = spec.find((c) => c.key === key);
    const out = [];
    for (const [year, tables] of Object.entries(crSeasons(data))) {
      const table = tables[cat];
      if (!table?.rows?.length) continue;
      const at = statColumn(table, col.re);
      if (at === -1) continue;
      const nameAt = statNameColumn(table), teamAt = statTeamColumn(table);
      for (const row of table.rows) {
        const v = statNumber(row[at]);
        if (v === null || v <= 0) continue;
        const name = String(row[nameAt] || "").trim();
        if (!name) continue;
        const team = teamAt !== -1 && teamAt !== nameAt ? (lookupTeamId(row[teamAt]) || String(row[teamAt] || "").trim()) : "";
        if (rookiesOnly && rookieYear(name, team) !== Number(year)) continue;
        out.push({ name, team, value: v, context: `${year}${team ? ` · ${team}` : ""}` });
      }
    }
    return out;
  }
  function careerEntries(cat, key) {
    return crTotals(data, cat).filter((p) => (p.t[key] ?? 0) > 0).map((p) => {
      const years = [...p.seasons].sort();
      return { name: p.name, team: p.teams[p.teams.length - 1] || "", value: p.t[key],
        context: `${years[0]}${years.length > 1 ? `–${years[years.length - 1]}` : ""} · ${years.length} season${years.length === 1 ? "" : "s"}` };
    });
  }

  // ---------- Drawing ----------
  function card(label, entries, half, suffix = "") {
    const box = el("article", "record-card");
    box.append(el("h3", "", label));
    const ranked = entries.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, TOP);
    if (!ranked.length) { box.append(el("p", "record-empty", "No record yet.")); return box; }
    const [best, ...rest] = ranked;
    const top = el("div", "record-top");
    const who = el("div", "record-who");
    const name = el("strong");
    name.append(playerName(best.name, best.team));
    who.append(name, el("small", "", best.context));
    const value = el(best.link ? "a" : "span", "record-value", `${fmt(best.value, half)}${suffix}`);
    if (best.link) { value.href = best.link; value.title = "Open the box score"; }
    top.append(who, value);
    box.append(top);
    if (rest.length) {
      const ol = el("ol", "record-list");
      ol.start = 2;
      for (const e of rest) {
        const li = el("li");
        const n = el("span", "record-name");
        n.append(playerName(e.name, e.team), el("small", "", ` ${e.context}`));
        const v = el(e.link ? "a" : "b", "record-num", `${fmt(e.value, half)}${suffix}`);
        if (e.link) { v.href = e.link; v.title = "Open the box score"; }
        li.append(n, v);
        ol.append(li);
      }
      box.append(ol);
    }
    return box;
  }

  function render() {
    const tabs = document.querySelector("#records-tabs");
    tabs.replaceChildren(...views.map(([key, label]) => {
      const b = el("button", `tab-button${key === view ? " is-active" : ""}`, label);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(key === view));
      b.addEventListener("click", () => { view = key; try { localStorage.setItem("nbf-record-view", key); } catch { /* fine */ } render(); });
      return b;
    }));
    const notes = {
      game: "Best single games, from every box score logged on Season Stats. Click a number to open the box score.",
      season: "Best single seasons, from every season in League History › Career Stats (the season in progress counts as it's played).",
      career: "Career totals across every season in League History › Career Stats.",
      "rookie-season": "Best seasons by a player in his first NFL season (from his years of experience, else his draft year).",
      "rookie-game": "Best single games by a player in his first NFL season. Click a number to open the box score.",
    };
    document.querySelector("#records-note").textContent = notes[view];
    const grid = document.querySelector("#records-grid");
    const cards = stats.map((stat) => {
      const [, label, , , cat, key, half] = stat;
      const entries = view === "game" ? gameEntries(stat, false)
        : view === "rookie-game" ? gameEntries(stat, true)
        : view === "season" ? seasonEntries(stat, false)
        : view === "rookie-season" ? seasonEntries(stat, true)
        : careerEntries(cat, key);
      return card(label, entries, half);
    });
    // Career: longest field goal made (best single-season long across a career).
    if (view === "career") cards.push(card("Longest Field Goal Made", careerEntries("kicking", "lng"), false, " yds"));
    grid.replaceChildren(...cards);
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== officeStorageKey) return;
    try { data = readStoredOffice() || data; rookieCache.clear(); render(); } catch { /* keep */ }
  });
  render();
})();
