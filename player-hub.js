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
  function renderLeague() {
    const box = document.querySelector("#hub-league");
    const roster = hubRoster();
    const byKey = new Map(roster.map((r) => [r.key, r]));
    const year = crLiveSeason(officeData);
    const seasonsAll = crSeasons(officeData);
    const note = document.querySelector("#hub-league-note");
    const parts = [];
    for (const category of Object.keys(crCats)) {
      const spec = crSpec[category];
      let rows = [];
      if (period === "season") {
        const table = seasonsAll[year]?.[category];
        if (table?.rows?.length) {
          const nameAt = statNameColumn(table), teamAt = statTeamColumn(table);
          for (const row of table.rows) {
            const team = teamAt !== -1 && teamAt !== nameAt ? lookupTeamId(row[teamAt]) : "";
            const key = normalizePlayerName(String(row[nameAt] || ""));
            // His row for this team, or, with no team column, anyone on this team's roster.
            if (team ? team !== activeTeamId : !byKey.has(key)) continue;
            rows.push({ name: String(row[nameAt]).trim(), key, t: rowLine(table, row, spec) });
          }
        }
      } else {
        rows = crTotals(officeData, category).filter((p) => byKey.has(p.key)).map((p) => ({ name: p.name, key: p.key, t: p.t, seasons: p.seasons.size }));
      }
      if (!rows.length) continue;
      const sortKey = { passing: "yds", rushing: "yds", receiving: "yds", defense: "tkl", kicking: "pts" }[category];
      rows.sort((a, b) => (b.t[sortKey] ?? -1) - (a.t[sortKey] ?? -1));
      // Every category's table uses the same column widths (Player, then fixed stat columns, then a filler),
      // so the columns line up from one table to the next.
      const wrap = el("div", "hub-table-wrap");
      wrap.append(el("div", "hub-table-title", crCats[category]));
      const table = el("table", "hub-table");
      const head = table.createTHead().insertRow();
      for (const label of ["Player", ...(period === "career" ? ["Seasons"] : []), ...spec.map((c) => c.label)]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        th.className = label === "Player" ? "hub-col-name" : "is-number";
        head.append(th);
      }
      head.append(Object.assign(document.createElement("th"), { className: "hub-col-fill", ariaHidden: "true" }));
      const body = table.createTBody();
      for (const r of rows) {
        const tr = body.insertRow();
        const name = tr.insertCell();
        name.className = "hub-col-name";
        const onTeam = byKey.get(r.key);
        if (onTeam) {
          name.append(Object.assign(document.createElement("a"), { href: profileUrl(onTeam.player.id), textContent: r.name }));
          if (onTeam.group !== "Active") name.append(el("span", `hub-badge is-${onTeam.group.toLowerCase()}`, onTeam.group));
        } else {
          name.append(r.name);
          name.append(el("span", "hub-badge is-gone", "GONE"));
          name.title = "No longer on this team's roster";
        }
        if (period === "career") { const td = tr.insertCell(); td.textContent = String(r.seasons); td.className = "is-number"; }
        for (const c of spec) { const td = tr.insertCell(); td.textContent = crFormat(c, r.t[c.key]); td.className = `is-number${c.key === sortKey ? " is-key" : ""}`; }
        tr.insertCell().className = "hub-col-fill";
      }
      wrap.append(table);
      parts.push(wrap);
    }
    note.textContent = period === "season"
      ? `${year} stats for this team, from Season Stats (box scores or pasted tables).`
      : "Career NBNFL totals for players on this team's roster now, across every season in League History › Career Stats (including time with other teams).";
    box.replaceChildren(...(parts.length ? parts : [el("p", "empty-state", period === "season" ? `No ${year} stats for this team yet. They come from Season Stats as games are played.` : "No career stats on record for this roster yet.")]));
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
