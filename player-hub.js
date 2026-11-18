// Team page › Player Hub: this team's players in NBNFL (season or career stats from the Career Stats record book,
// career-core.js) and in real life, pulled from ESPN's public APIs in the viewer's browser:
//   • the league-wide injury report and transactions (one request each),
//   • each player's overview (latest Rotowire note and recent game log), found by his ESPN id: taken from an
//     imported ESPN headshot link when he has one, otherwise looked up once by name and remembered.
// What comes back is kept in this browser for 30 minutes (localStorage), so switching tabs doesn't refetch.
// Uses league-core.js, stat-totals.js, career-core.js and front-office.js (officeData, activeTeamId, activeTab).
(function playerHub() {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const hubYear = () => (seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0]);
  let period = "season";
  // NBNFL or IRL: one view at a time, remembered in this browser.
  let view = "nbnfl";
  try { if (localStorage.getItem("nbf-hub-view") === "irl") view = "irl"; } catch { /* default */ }
  let group = "all";
  let loadingTeam = null;
  const idsKey = "nbf-espn-ids";
  const cacheKey = "nbf-hub-cache";
  const ttl = 30 * 60 * 1000;

  // ---------- Who's on the team ----------
  function hubRoster() {
    const year = hubYear();
    return (officeData.teams[activeTeamId]?.roster || []).filter((p) => isPlayerOnSeason(p, year) && !isRetiredPlayer(p)).map((player) => {
      const entry = seasonEntry(player, year);
      const g = isOnCel(entry) ? "CEL" : isPracticeSquad(entry) ? "PS" : "Active";
      return { player, entry, group: g, position: entry?.position || "", key: normalizePlayerName(player.name) };
    });
  }
  const groupLabel = { Active: "Active", CEL: "CEL", PS: "Practice squad" };

  // ---------- NBNFL stats ----------
  function rowLine(table, row, spec) {
    const cols = spec.map((c) => (c.re ? statColumn(table, c.re) : -1));
    const t = {};
    spec.forEach((c, i) => { if (cols[i] !== -1) { const v = statNumber(row[cols[i]]); if (v !== null) t[c.key] = v; } });
    for (const c of spec) if (c.calc) t[c.key] = c.calc(t);
    return t;
  }
  // ESPN-style team stats: tables per category with a NAME column (position after the name), group headings
  // (TACKLES, SACKS, …), sortable columns with the sorted one shaded, and a Total row; Team Leaders cards on top.
  const hubCols = {
    gp: { label: "GP" }, cmp: { label: "CMP" }, att: { label: "ATT" }, car: { label: "CAR", from: "att" }, pct: { label: "CMP%", fmt: 1 },
    yds: { label: "YDS" }, ypa: { label: "AVG", fmt: 1 }, avg: { label: "AVG", fmt: 1 }, ydsg: { label: "YDS/G", fmt: 1, calc: (t) => (t.gp ? t.yds / t.gp : null) },
    lng: { label: "LNG", max: true }, td: { label: "TD" }, int: { label: "INT" }, rate: { label: "RTG", fmt: 1 }, rec: { label: "REC" },
    tkl: { label: "TOT" }, tfl: { label: "TFL", fmt: "half" }, sacks: { label: "SACK", fmt: "half" }, pd: { label: "PD" }, ff: { label: "FF" }, fr: { label: "FR" },
    fgm: { label: "FGM" }, fga: { label: "FGA" }, fgpct: { label: "FG%", fmt: 1 }, xpm: { label: "XPM" }, xpa: { label: "XPA" },
    xppct: { label: "XP%", fmt: 1, calc: (t) => (t.xpa ? (t.xpm / t.xpa) * 100 : null) }, pts: { label: "PTS" },
    rushTd: { label: "RUSH" }, recTd: { label: "REC" }, allTd: { label: "TD" }, fg: { label: "FG" }, pat: { label: "PAT" }, tpg: { label: "TP/G", fmt: 1, calc: (t) => (t.gp ? t.pts / t.gp : null) },
  };
  const hubTables = [
    { key: "passing", title: "Passing", sort: "yds", groups: [["", ["gp", "cmp", "att", "pct", "yds", "ypa", "ydsg", "lng", "td", "int", "rate"]]] },
    { key: "rushing", title: "Rushing", sort: "yds", groups: [["", ["gp", "car", "yds", "avg", "lng", "td", "ydsg"]]] },
    { key: "receiving", title: "Receiving", sort: "yds", groups: [["", ["gp", "rec", "yds", "avg", "td", "lng", "ydsg"]]] },
    { key: "defense", title: "Defense", sort: "tkl", groups: [["", ["gp"]], ["TACKLES", ["tkl", "tfl"]], ["SACKS", ["sacks"]], ["INTERCEPTIONS", ["pd", "int", "td"]], ["FUMBLES", ["ff", "fr"]]] },
    { key: "scoring", title: "Scoring", sort: "pts", groups: [["", ["gp"]], ["TOUCHDOWNS", ["rushTd", "recTd", "allTd"]], ["SCORING", ["fg", "pat", "pts", "tpg"]]] },
    { key: "kicking", title: "Kicking", sort: "fgm", groups: [["", ["gp"]], ["FIELD GOALS", ["fgm", "fga", "fgpct", "lng"]], ["EXTRA POINTS", ["xpm", "xpa", "xppct"]]] },
  ];
  const hubSort = {}; // table key → { col, dir }
  const hubFmt = (col, v) => crFormat(hubCols[col].fmt ? { fmt: hubCols[col].fmt } : {}, v);

  // Rows for one category: [{ name, key, pos, t }] for this season (this team's rows) or careers (current roster).
  function categoryRows(category, roster, byKey) {
    const spec = crSpec[category];
    if (period === "career") {
      return crTotals(officeData, category).filter((p) => byKey.has(p.key)).map((p) => ({ name: p.name, key: p.key, t: { ...p.t } }));
    }
    const table = crSeasons(officeData)[crLiveSeason(officeData)]?.[category];
    if (!table?.rows?.length) return [];
    const nameAt = statNameColumn(table), teamAt = statTeamColumn(table), posAt = statColumn(table, /^(POS|POSITION)$/);
    const rows = [];
    for (const row of table.rows) {
      const team = teamAt !== -1 && teamAt !== nameAt ? lookupTeamId(row[teamAt]) : "";
      const key = normalizePlayerName(String(row[nameAt] || ""));
      if (team ? team !== activeTeamId : !byKey.has(key)) continue;
      rows.push({ name: String(row[nameAt]).trim(), key, pos: posAt !== -1 ? String(row[posAt] || "") : "", t: rowLine(table, row, spec) });
    }
    return rows;
  }
  function withDerived(t) {
    for (const [k, c] of Object.entries(hubCols)) if (c.calc) t[k] = c.calc(t);
    if (t.att !== undefined && t.car === undefined) t.car = t.att;
    if (t.avg === undefined && t.ypa !== undefined) t.avg = t.ypa;
    return t;
  }
  // Total row: counting stats added up, LNG the best, rates worked out again from the totals.
  function totalLine(category, rows) {
    const t = {};
    const spec = crSpec[category] || [];
    for (const r of rows) for (const [k, v] of Object.entries(r.t)) {
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      const c = spec.find((x) => x.key === k);
      if (c?.calc || hubCols[k]?.calc) continue;
      if (k === "gp") t.gp = Math.max(t.gp || 0, v);
      else if (c?.max || hubCols[k]?.max) t[k] = Math.max(t[k] ?? -Infinity, v);
      else t[k] = (t[k] || 0) + v;
    }
    for (const c of spec) if (c.calc) t[c.key] = c.calc(t);
    return withDerived(t);
  }

  function renderLeague() {
    const box = document.querySelector("#hub-league");
    const roster = hubRoster();
    const byKey = new Map(roster.map((r) => [r.key, r]));
    const year = crLiveSeason(officeData);
    const data = {};
    for (const c of Object.keys(crCats)) data[c] = categoryRows(c, roster, byKey).map((r) => ({ ...r, pos: r.pos || byKey.get(r.key)?.position || "", t: withDerived(r.t) }));
    // Scoring: touchdowns from rushing and receiving, kicking points, all by player.
    const scoring = new Map();
    const add = (r, f) => { const s = scoring.get(r.key) || { name: r.name, key: r.key, pos: r.pos, t: { gp: 0, rushTd: 0, recTd: 0, allTd: 0, fg: 0, pat: 0, pts: 0 } }; f(s.t, r.t); s.t.gp = Math.max(s.t.gp, r.t.gp || 0); scoring.set(r.key, s); };
    for (const r of data.rushing) add(r, (s, t) => { s.rushTd += t.td || 0; });
    for (const r of data.receiving) add(r, (s, t) => { s.recTd += t.td || 0; });
    for (const r of data.kicking) add(r, (s, t) => { s.fg += t.fgm || 0; s.pat += t.xpm || 0; s.kick = t.pts ?? (t.fgm || 0) * 3 + (t.xpm || 0); });
    data.scoring = [...scoring.values()].map((s) => { s.t.allTd = s.t.rushTd + s.t.recTd; s.t.pts = s.t.allTd * 6 + (s.t.kick || 0); delete s.t.kick; return { ...s, t: withDerived(s.t) }; }).filter((s) => s.t.pts > 0);

    const note = document.querySelector("#hub-league-note");
    note.textContent = period === "season"
      ? `${year} regular season, from Season Stats (box scores or pasted tables). Click a column to sort.`
      : "Career NBNFL totals for players on this roster now, across every season in Career Stats (time with other teams included). Click a column to sort.";
    const parts = [];
    // Team leaders
    const leaders = [["Passing Yards", "passing", "yds"], ["Rushing Yards", "rushing", "yds"], ["Receiving Yards", "receiving", "yds"], ["Tackles", "defense", "tkl"], ["Interceptions", "defense", "int"]]
      .map(([label, cat, col]) => { const best = [...data[cat]].sort((a, b) => (b.t[col] ?? -1) - (a.t[col] ?? -1))[0]; return best && best.t[col] > 0 ? { label, best, value: hubFmt(col, best.t[col]) } : null; })
      .filter(Boolean);
    if (leaders.length) {
      const wrap = el("div", "hub-leaders-wrap");
      wrap.append(el("h5", "hub-sub", "Team Leaders"));
      const row = el("div", "hub-leaders");
      for (const { label, best, value } of leaders) {
        const card = el("div", "hub-leader");
        card.append(el("span", "hub-leader-label", label));
        const body = el("div", "hub-leader-body");
        const onTeam = byKey.get(best.key);
        body.append(onTeam ? playerPortrait(onTeam.player) : el("span", "player-portrait"));
        const text = el("div", "hub-leader-text");
        const name = el("span", "hub-leader-name");
        if (onTeam) name.append(Object.assign(document.createElement("a"), { href: profileUrl(onTeam.player.id), textContent: best.name })); else name.append(best.name);
        if (best.pos) name.append(el("small", "", ` ${best.pos}`));
        text.append(name, el("strong", "", value));
        body.append(text);
        card.append(body);
        row.append(card);
      }
      wrap.append(row);
      parts.push(wrap);
    }
    for (const spec of hubTables) {
      const rows = data[spec.key] || [];
      if (!rows.length) continue;
      const sort = hubSort[spec.key] || { col: spec.sort, dir: -1 };
      rows.sort((a, b) => (sort.col === "name" ? a.name.localeCompare(b.name) * sort.dir : ((a.t[sort.col] ?? -Infinity) - (b.t[sort.col] ?? -Infinity)) * sort.dir) || a.name.localeCompare(b.name));
      const cols = spec.groups.flatMap(([, c]) => c);
      const section = el("section", "hub-cat");
      section.append(el("h5", "hub-sub", spec.title));
      const wrap = el("div", "hub-table-wrap");
      const table = el("table", "hub-table");
      // Fixed widths come from the columns (not the group heading row), so every table lines up the same way.
      const colgroup = el("colgroup");
      colgroup.append(el("col", "hub-c-name"), ...cols.map(() => el("col", "hub-c-stat")), el("col", "hub-c-fill"));
      table.append(colgroup);
      const thead = table.createTHead();
      // Group headings (TACKLES, SACKS, …) above their columns.
      if (spec.groups.some(([g]) => g)) {
        const gr = thead.insertRow();
        gr.className = "hub-group-row";
        gr.append(Object.assign(document.createElement("th"), { className: "hub-col-name" }));
        for (const [g, c] of spec.groups) {
          const th = document.createElement("th");
          th.colSpan = c.length;
          th.textContent = g;
          th.className = "hub-group";
          gr.append(th);
        }
        gr.append(Object.assign(document.createElement("th"), { className: "hub-col-fill" }));
      }
      const hr = thead.insertRow();
      const sortBtn = (label, col) => {
        const b = el("button", "hub-sort", label);
        b.type = "button";
        b.addEventListener("click", () => { hubSort[spec.key] = { col, dir: sort.col === col ? -sort.dir : col === "name" ? 1 : -1 }; renderLeague(); });
        return b;
      };
      const nameTh = document.createElement("th");
      nameTh.className = "hub-col-name";
      nameTh.append(sortBtn("NAME", "name"));
      hr.append(nameTh);
      spec.groups.forEach(([, c], gi) => c.forEach((col, ci) => {
        const th = document.createElement("th");
        th.className = `is-number${sort.col === col ? " is-sorted" : ""}${ci === 0 && gi > 0 ? " hub-group-start" : ""}`;
        const b = sortBtn(hubCols[col].label, col);
        if (sort.col === col) b.append(el("span", "hub-sort-mark", sort.dir < 0 ? " ▾" : " ▴"));
        th.append(b);
        th.setAttribute("aria-sort", sort.col === col ? (sort.dir < 0 ? "descending" : "ascending") : "none");
        hr.append(th);
      }));
      hr.append(Object.assign(document.createElement("th"), { className: "hub-col-fill" }));
      const starts = new Set(spec.groups.slice(1).map(([, c]) => c[0]));
      const line = (tr, t) => {
        for (const col of cols) {
          const td = tr.insertCell();
          td.textContent = hubFmt(col, t[col]);
          td.className = `is-number${sort.col === col ? " is-sorted" : ""}${starts.has(col) ? " hub-group-start" : ""}`;
        }
        tr.insertCell().className = "hub-col-fill";
      };
      const body = table.createTBody();
      for (const r of rows) {
        const tr = body.insertRow();
        const name = tr.insertCell();
        name.className = "hub-col-name";
        const onTeam = byKey.get(r.key);
        if (onTeam) name.append(Object.assign(document.createElement("a"), { href: profileUrl(onTeam.player.id), textContent: r.name }));
        else { name.append(r.name); name.title = "No longer on this team's roster"; }
        if (r.pos) name.append(el("small", "hub-pos", ` ${r.pos}`));
        if (onTeam && onTeam.group !== "Active") name.append(el("span", `hub-badge is-${onTeam.group.toLowerCase()}`, onTeam.group));
        if (!onTeam) name.append(el("span", "hub-badge is-gone", "GONE"));
        line(tr, r.t);
      }
      if (period === "season" && spec.key !== "scoring") {
        const tf = table.createTFoot().insertRow();
        tf.className = "hub-total";
        tf.insertCell().textContent = "Total";
        tf.cells[0].className = "hub-col-name";
        line(tf, totalLine(spec.key, rows));
      }
      wrap.append(table);
      section.append(wrap);
      parts.push(section);
    }
    if (parts.length <= 0) parts.push(el("p", "empty-state", period === "season" ? `No ${year} stats for this team yet. They come from Season Stats as games are played.` : "No career stats on record for this roster yet."));
    box.replaceChildren(...parts);
  }

  // ---------- ESPN ----------
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full or blocked: fine */ } },
  };
  async function getJson(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    return res.json();
  }
  const espnIdFromProfile = (player) => (String(player.profile?.photoUrl || "").match(/espncdn\.com\/i\/headshots\/nfl\/players\/full\/(\d+)/) || [])[1] || "";
  // His ESPN NFL athlete id: from his headshot link, else ESPN's search by name (only when exactly one NFL player has it).
  async function espnIdFor(player) {
    const fromPhoto = espnIdFromProfile(player);
    if (fromPhoto) return fromPhoto;
    const ids = store.get(idsKey) || {};
    if (ids[player.id] !== undefined) return ids[player.id];
    const want = normalizePlayerName(player.name);
    const json = await getJson(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(player.name)}&limit=25`);
    const found = new Set();
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const uid = String(node.uid || "");
      if (/^s:20~l:28~a:\d+$/.test(uid) && normalizePlayerName(node.displayName || "") === want) found.add(uid.split("~a:")[1]);
      else Object.values(node).forEach(walk);
    };
    walk(json);
    const id = found.size === 1 ? [...found][0] : "";
    ids[player.id] = id;
    store.set(idsKey, ids);
    return id;
  }
  // The league-wide injury report and recent transactions, cached for 30 minutes.
  async function leagueFeeds() {
    const cache = store.get(cacheKey) || {};
    if (cache.league && Date.now() - cache.league.at < ttl) return cache.league;
    const [inj, tx] = await Promise.all([
      getJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries").catch(() => null),
      getJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/transactions?limit=1000").catch(() => null),
    ]);
    if (!inj && !tx) throw new Error("ESPN couldn't be reached");
    const injuries = {};
    for (const team of inj?.injuries || []) for (const i of team.injuries || []) {
      const id = (JSON.stringify(i.athlete?.links || []).match(/\/id\/(\d+)\//) || [])[1];
      if (id) injuries[id] = { status: i.status || "", note: i.shortComment || "", date: i.date || "", team: team.displayName || "" };
    }
    const transactions = (tx?.transactions || []).map((t) => ({ date: t.date, team: t.team?.abbreviation || "", text: t.description || "" }));
    const league = { at: Date.now(), injuries, transactions };
    store.set(cacheKey, { ...cache, league });
    return league;
  }
  // A short stat line for one game from ESPN's game log groups.
  const lineLabels = { Passing: ["CMP", "ATT", "YDS", "TD", "INT"], Rushing: ["CAR", "YDS", "TD"], Receiving: ["REC", "YDS", "TD"], Defensive: ["TOT", "SACK", "INT", "PD"], Defense: ["TOT", "SACK", "INT", "PD"], Kicking: ["FG", "XP", "PTS"], Punting: ["PUNTS", "AVG"] };
  function gameLine(statistics, eventId) {
    const bits = [];
    for (const g of statistics || []) {
      const ev = (g.events || []).find((e) => e.eventId === eventId);
      if (!ev) continue;
      const want = lineLabels[g.displayName] || g.labels.slice(0, 3);
      const parts = [];
      for (const label of want) {
        const i = g.labels.indexOf(label);
        if (i === -1 || ev.stats[i] === undefined || ev.stats[i] === "" || ev.stats[i] === "0" && !["TD", "INT"].includes(label)) continue;
        if (label === "CMP" && g.labels.includes("ATT")) { parts.push(`${ev.stats[i]}/${ev.stats[g.labels.indexOf("ATT")]}`); continue; }
        if (label === "ATT" && g.labels.includes("CMP")) continue;
        if (label === "INT" && g.displayName === "Passing" && ev.stats[i] === "0") continue;
        if (label === "TD" && ev.stats[i] === "0") continue;
        parts.push(`${ev.stats[i]} ${({ TD: "TD", INT: "INT", TOT: "tkl", SACK: "sacks", PD: "PD", FG: "FG", XP: "XP", PTS: "pts" })[label] || label.toLowerCase()}`);
      }
      if (parts.length) bits.push(parts.join(", "));
    }
    return bits.join(" · ");
  }
  async function playerUpdate(espnId) {
    const cache = store.get(cacheKey) || {};
    const hit = cache.players?.[espnId];
    if (hit && Date.now() - hit.at < ttl) return hit;
    const ov = await getJson(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}/overview`);
    const events = Object.values(ov.gameLog?.events || {}).sort((a, b) => String(b.gameDate).localeCompare(String(a.gameDate)));
    const last = events[0];
    const rot = ov.rotowire || null;
    const update = {
      at: Date.now(),
      news: rot ? { text: rot.headline || rot.description || "", published: rot.published ? new Date(rot.published).toISOString() : "" } : null,
      last: last ? { date: last.gameDate, team: last.team?.abbreviation || "", opp: `${last.atVs || "vs"} ${last.opponent?.abbreviation || ""}`, result: `${last.gameResult || ""} ${last.score || ""}`.trim(), line: gameLine(ov.gameLog?.statistics, last.id), week: last.week } : null,
    };
    const fresh = store.get(cacheKey) || {};
    fresh.players = { ...(fresh.players || {}), [espnId]: update };
    // Keep the cache small: drop entries older than a day.
    for (const [id, v] of Object.entries(fresh.players)) if (Date.now() - v.at > 24 * 3600 * 1000) delete fresh.players[id];
    store.set(cacheKey, fresh);
    return update;
  }

  const shortDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
  const nameIn = (text, name) => {
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z])${n}($|[^A-Za-z])`, "i").test(text);
  };

  let realState = null; // { team, players: [{ r, espnId, injury, tx, update, error }], league, at }
  async function loadReal(force = false) {
    const status = document.querySelector("#hub-status");
    if (loadingTeam === activeTeamId) return;
    if (!force && realState?.team === activeTeamId) { drawReal(); return; }
    if (force) { const c = store.get(cacheKey) || {}; delete c.league; c.players = {}; store.set(cacheKey, c); }
    const team = activeTeamId;
    loadingTeam = team;
    const roster = hubRoster();
    realState = { team, players: roster.map((r) => ({ r })), league: null, at: Date.now() };
    drawReal();
    status.textContent = "Getting the injury report and transactions from ESPN…";
    try {
      realState.league = await leagueFeeds();
    } catch {
      status.textContent = "ESPN couldn't be reached from this browser, so there are no real-life updates right now. Try Refresh in a bit.";
      loadingTeam = null;
      return;
    }
    let done = 0, next = 0;
    const work = async () => {
      while (next < realState.players.length) {
        const item = realState.players[next++];
        try {
          item.espnId = await espnIdFor(item.r.player);
          if (item.espnId) {
            item.injury = realState.league.injuries[item.espnId] || null;
            item.update = await playerUpdate(item.espnId);
          }
        } catch (error) { item.error = error.message || "failed"; }
        item.tx = realState.league.transactions.filter((t) => nameIn(t.text, item.r.player.name)).slice(0, 3)
          .map((t) => ({ ...t, text: t.text.split(/(?<=\.)\s+/).filter((s) => nameIn(s, item.r.player.name)).join(" ") || t.text }));
        done += 1;
        if (activeTeamId !== team) return;
        status.textContent = `Getting real-life updates from ESPN… ${done} of ${realState.players.length}`;
        if (done % 6 === 0) drawReal();
      }
    };
    await Promise.all(Array.from({ length: 6 }, work));
    loadingTeam = null;
    if (activeTeamId !== team) return;
    const matched = realState.players.filter((p) => p.espnId).length;
    status.textContent = `Updated ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${matched} of ${realState.players.length} players found on ESPN. Kept for 30 minutes; Refresh gets the latest.`;
    drawReal();
  }

  function drawReal() {
    const box = document.querySelector("#hub-real");
    if (!realState || realState.team !== activeTeamId) { box.replaceChildren(); return; }
    const list = realState.players.filter((p) => group === "all" || p.r.group === group);
    // Injury report
    const injured = list.filter((p) => p.injury);
    const inj = el("div", "hub-block");
    inj.append(el("h5", "", `Injury report (${injured.length})`));
    if (injured.length) {
      const wrap = el("div", "stats-table-wrap");
      const table = el("table", "stats-table hub-injury-table");
      const head = table.createTHead().insertRow();
      for (const label of ["Player", "NBNFL", "NFL team", "Status", "Update", "Date"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; head.append(th); }
      const body = table.createTBody();
      for (const p of injured.sort((a, b) => String(b.injury.date).localeCompare(String(a.injury.date)))) {
        const tr = body.insertRow();
        const name = tr.insertCell();
        name.className = "stats-name";
        name.append(Object.assign(document.createElement("a"), { href: profileUrl(p.r.player.id), textContent: p.r.player.name }));
        tr.insertCell().textContent = groupLabel[p.r.group];
        tr.insertCell().textContent = p.injury.team;
        const st = tr.insertCell();
        st.append(el("span", `hub-inj is-${p.injury.status.toLowerCase().replace(/[^a-z]+/g, "-")}`, p.injury.status));
        const note = tr.insertCell();
        note.className = "hub-note-cell";
        note.textContent = p.injury.note;
        tr.insertCell().textContent = shortDate(p.injury.date);
      }
      wrap.append(table);
      inj.append(wrap);
    } else inj.append(el("p", "hub-empty", realState.league ? "No one on this list is on ESPN's injury report." : "Loading…"));
    // Player updates: latest note, last game and transactions, newest first.
    const cards = el("div", "hub-cards");
    const when = (p) => [p.update?.news?.published, p.update?.last?.date, p.tx?.[0]?.date].filter(Boolean).sort().pop() || "";
    const withNews = list.filter((p) => p.update?.news || p.update?.last || p.tx?.length).sort((a, b) => when(b).localeCompare(when(a)));
    for (const p of withNews) {
      const card = el("article", "hub-card");
      const head = el("div", "hub-card-head");
      head.append(playerPortrait(p.r.player));
      const who = el("div", "hub-card-who");
      const name = el("strong");
      name.append(Object.assign(document.createElement("a"), { href: profileUrl(p.r.player.id), textContent: p.r.player.name }));
      who.append(name, el("small", "", [p.r.position, groupLabel[p.r.group], p.update?.last?.team ? `NFL: ${p.update.last.team}` : ""].filter(Boolean).join(" · ")));
      head.append(who);
      if (p.injury) head.append(el("span", `hub-inj is-${p.injury.status.toLowerCase().replace(/[^a-z]+/g, "-")}`, p.injury.status));
      card.append(head);
      if (p.update?.last) {
        const g = el("p", "hub-game");
        g.append(el("b", "", `${shortDate(p.update.last.date)} ${p.update.last.opp}`), ` ${p.update.last.result}`);
        if (p.update.last.line) g.append(el("span", "hub-game-line", p.update.last.line));
        card.append(g);
      }
      if (p.update?.news?.text) {
        const n = el("p", "hub-news");
        if (p.update.news.published) n.append(el("time", "", shortDate(p.update.news.published)));
        n.append(` ${p.update.news.text}`);
        card.append(n);
      }
      for (const t of p.tx || []) {
        const x = el("p", "hub-tx");
        x.append(el("time", "", `${shortDate(t.date)} ${t.team}`), ` ${t.text}`);
        card.append(x);
      }
      if (p.espnId) card.append(Object.assign(document.createElement("a"), { className: "hub-espn", href: `https://www.espn.com/nfl/player/_/id/${p.espnId}`, textContent: "ESPN player page ↗", target: "_blank", rel: "noopener" }));
      cards.append(card);
    }
    const updates = el("div", "hub-block");
    updates.append(el("h5", "", "Latest on each player"), withNews.length ? cards : el("p", "hub-empty", realState.league ? "No updates yet." : "Loading…"));
    // Not found on ESPN
    const missing = list.filter((p) => p.espnId === "" || p.error);
    const miss = el("p", "hub-missing");
    if (missing.length) miss.textContent = `Not found on ESPN (${missing.length}): ${missing.map((p) => p.r.player.name).join(", ")}. Importing headshots (Admin › Player Headshots) links players to ESPN by id.`;
    box.replaceChildren(inj, updates, ...(missing.length ? [miss] : []));
  }

  function showView() {
    document.querySelectorAll("[data-hub-view]").forEach((b) => { const on = b.dataset.hubView === view; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", String(on)); });
    document.querySelector("#hub-view-nbnfl").hidden = view !== "nbnfl";
    document.querySelector("#hub-view-irl").hidden = view !== "irl";
  }
  // ESPN is only asked once the IRL view is opened.
  function renderPlayerHub() {
    showView();
    if (view === "nbnfl") renderLeague();
    else loadReal(false);
  }
  document.querySelectorAll("[data-hub-view]").forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.hubView;
    try { localStorage.setItem("nbf-hub-view", view); } catch { /* fine */ }
    renderPlayerHub();
  }));

  document.querySelectorAll("[data-hub-period]").forEach((b) => b.addEventListener("click", () => {
    period = b.dataset.hubPeriod;
    document.querySelectorAll("[data-hub-period]").forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    renderLeague();
  }));
  document.querySelectorAll("[data-hub-group]").forEach((b) => b.addEventListener("click", () => {
    group = b.dataset.hubGroup;
    document.querySelectorAll("[data-hub-group]").forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    drawReal();
  }));
  document.querySelector("#hub-refresh").addEventListener("click", () => { realState = null; loadReal(true); });

  globalThis.renderPlayerHub = renderPlayerHub;
  if (typeof activeTab !== "undefined" && activeTab === "player-hub") renderPlayerHub();
})();
