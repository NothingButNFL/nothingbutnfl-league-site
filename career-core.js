// Career stats shared by League History › Career Stats (career-stats.js) and › Retired Players (retired.js):
// the record book (data.careerSeasons plus the season in progress from Season Stats) and per-player totals.
// Uses league-core.js and stat-totals.js. Functions take the league data as their first argument.
const crCats = { passing: "Passing", rushing: "Rushing", receiving: "Receiving", defense: "Defense", kicking: "Kicking" };
// Columns per category. sum: added across seasons; max: best season (longest); calc: worked out from the totals.
// The patterns match the headers of box-score tables and of most pasted tables.
const crSpec = {
  passing: [
    { key: "gp", label: "GP", re: /^(GP|G|GAMES)$/ },
    { key: "cmp", label: "Cmp", re: /^(CMP|COMP|COMPLETIONS|PASSCMP)$/ },
    { key: "att", label: "Att", re: /^(ATT|ATTEMPTS|PASSATT)$/ },
    { key: "pct", label: "Cmp%", calc: (t) => (t.att ? (t.cmp / t.att) * 100 : null), fmt: 1 },
    { key: "yds", label: "Yds", re: /^(PASS)?(YDS|YARDS)$/, lead: "Passing yards" },
    { key: "td", label: "TD", re: /^(PASS)?TDS?$/, lead: "Passing touchdowns" },
    { key: "int", label: "Int", re: /^(INT|INTS|INTERCEPTIONS)$/ },
    { key: "ypa", label: "Y/A", calc: (t) => (t.att ? t.yds / t.att : null), fmt: 1 },
    { key: "lng", label: "Lng", re: /^(LNG|LONG)$/, max: true },
    { key: "rate", label: "Rate", calc: (t) => (t.att >= 1 && typeof passerRating === "function" ? passerRating(t.cmp, t.att, t.yds, t.td, t.int) : null), fmt: 1 },
  ],
  rushing: [
    { key: "gp", label: "GP", re: /^(GP|G|GAMES)$/ },
    { key: "att", label: "Att", re: /^(ATT|CAR|CARRIES|RUSHATT|RUSHES)$/ },
    { key: "yds", label: "Yds", re: /^(RUSH)?(YDS|YARDS)$/, lead: "Rushing yards" },
    { key: "avg", label: "Avg", calc: (t) => (t.att ? t.yds / t.att : null), fmt: 1 },
    { key: "td", label: "TD", re: /^(RUSH)?TDS?$/, lead: "Rushing touchdowns" },
    { key: "lng", label: "Lng", re: /^(LNG|LONG)$/, max: true },
  ],
  receiving: [
    { key: "gp", label: "GP", re: /^(GP|G|GAMES)$/ },
    { key: "rec", label: "Rec", re: /^(REC|RECEPTIONS|CATCHES)$/, lead: "Receptions" },
    { key: "yds", label: "Yds", re: /^(REC)?(YDS|YARDS)$/, lead: "Receiving yards" },
    { key: "avg", label: "Avg", calc: (t) => (t.rec ? t.yds / t.rec : null), fmt: 1 },
    { key: "td", label: "TD", re: /^(REC)?TDS?$/, lead: "Receiving touchdowns" },
    { key: "lng", label: "Lng", re: /^(LNG|LONG)$/, max: true },
  ],
  defense: [
    { key: "gp", label: "GP", re: /^(GP|G|GAMES)$/ },
    { key: "tkl", label: "Tkl", re: /^(TKL|TACKLES|COMB|TOT|TOTAL|TOTALTACKLES)$/, lead: "Tackles" },
    { key: "tfl", label: "TFL", re: /^(TFL|TFLS|TACKLESFORLOSS|TKLLOSS)$/, fmt: "half" },
    { key: "sacks", label: "Sacks", re: /^(SACKS?|SCK|SK)$/, fmt: "half", lead: "Sacks" },
    { key: "int", label: "Int", re: /^(INT|INTS|INTERCEPTIONS)$/, lead: "Interceptions" },
    { key: "ff", label: "FF", re: /^(FF|FUMFORCED|FORCEDFUMBLES)$/ },
    { key: "fr", label: "FR", re: /^(FR|FUMREC|FUMBLERECOVERIES)$/ },
    { key: "pd", label: "PD", re: /^(PD|PDEF|PASSESDEFENDED|PASSDEF)$/ },
    { key: "td", label: "TD", re: /^(TDS?|DEFTD)$/ },
  ],
  kicking: [
    { key: "gp", label: "GP", re: /^(GP|G|GAMES)$/ },
    { key: "fgm", label: "FGM", re: /^(FGM|FG)$/, lead: "Field goals made" },
    { key: "fga", label: "FGA", re: /^FGA$/ },
    { key: "fgpct", label: "FG%", calc: (t) => (t.fga ? (t.fgm / t.fga) * 100 : null), fmt: 1 },
    { key: "xpm", label: "XPM", re: /^(XPM|XP)$/ },
    { key: "xpa", label: "XPA", re: /^XPA$/ },
    { key: "lng", label: "Lng", re: /^(LNG|LONG)$/, max: true },
    { key: "pts", label: "Pts", re: /^(PTS|POINTS)$/, lead: "Points" },
  ],
};
const crDefaultSort = { passing: "yds", rushing: "yds", receiving: "yds", defense: "tkl", kicking: "pts" };

// ---------- The record book ----------
const crLiveSeason = (data) => data.stats?.season || currentLeagueYear();
function crLiveTables(data) {
  const out = {};
  for (const key of Object.keys(crCats)) {
    const table = typeof statTableFor === "function" ? statTableFor(data, key) : data.stats?.tables?.[key];
    if (table?.rows?.length) out[key] = { headers: [...table.headers], rows: table.rows.map((r) => [...r]) };
  }
  return out;
}
// Every season's tables: the saved ones, with the season in progress taken live from Season Stats.
function crSeasons(data) {
  const seasons = {};
  for (const [year, entry] of Object.entries(data.careerSeasons || {})) seasons[year] = entry.tables || {};
  const live = crLiveTables(data);
  if (Object.keys(live).length) seasons[crLiveSeason(data)] = { ...(seasons[crLiveSeason(data)] || {}), ...live };
  return seasons;
}
// Copies the season in progress into the record book (when it changed), so it survives Season Stats being cleared.

// ---------- Adding it up ----------
function crTotals(data, category) {
  const spec = crSpec[category];
  const players = new Map();
  const seasons = crSeasons(data);
  for (const year of Object.keys(seasons).sort()) {
    const table = seasons[year][category];
    if (!table?.rows?.length) continue;
    const nameAt = statNameColumn(table);
    const teamAt = statTeamColumn(table);
    const cols = spec.map((c) => (c.re ? statColumn(table, c.re) : -1));
    for (const row of table.rows) {
      const name = String(row[nameAt] || "").trim();
      const key = normalizePlayerName(name);
      if (!key) continue;
      const p = players.get(key) || { name, key, teams: [], seasons: new Set(), t: {} };
      p.name = name; // latest spelling
      p.seasons.add(year);
      const team = teamAt !== -1 && teamAt !== nameAt ? (lookupTeamId(row[teamAt]) || String(row[teamAt] || "").trim()) : "";
      if (team && p.teams[p.teams.length - 1] !== team) p.teams.push(team);
      spec.forEach((c, i) => {
        if (cols[i] === -1) return;
        const v = statNumber(row[cols[i]]);
        if (v === null) return;
        p.t[c.key] = c.max ? Math.max(p.t[c.key] ?? -Infinity, v) : (p.t[c.key] || 0) + v;
      });
      players.set(key, p);
    }
  }
  const list = [...players.values()];
  for (const p of list) for (const c of spec) if (c.calc) p.t[c.key] = c.calc(p.t);
  return list;
}
const crFormat = (c, v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  if (c.fmt === 1) return v.toFixed(1);
  if (c.fmt === "half") return String(Math.round(v * 2) / 2);
  return Math.round(v).toLocaleString("en-US");
};

// One player's career, by category: { totals, seasons: [{ year, team, t }] } for each category he has stats in.
function careerForPlayer(data, name) {
  const key = normalizePlayerName(name);
  const seasons = crSeasons(data);
  const out = {};
  for (const category of Object.keys(crCats)) {
    const spec = crSpec[category];
    const lines = [];
    for (const year of Object.keys(seasons).sort()) {
      const table = seasons[year][category];
      if (!table?.rows?.length) continue;
      const nameAt = statNameColumn(table), teamAt = statTeamColumn(table);
      const cols = spec.map((c) => (c.re ? statColumn(table, c.re) : -1));
      for (const row of table.rows) {
        if (normalizePlayerName(String(row[nameAt] || "")) !== key) continue;
        const t = {};
        spec.forEach((c, i) => { if (cols[i] !== -1) { const v = statNumber(row[cols[i]]); if (v !== null) t[c.key] = v; } });
        for (const c of spec) if (c.calc) t[c.key] = c.calc(t);
        const team = teamAt !== -1 && teamAt !== nameAt ? (lookupTeamId(row[teamAt]) || String(row[teamAt] || "").trim()) : "";
        lines.push({ year, team, t });
      }
    }
    if (!lines.length) continue;
    const total = crTotals(data, category).find((p) => p.key === key);
    out[category] = { totals: total?.t || {}, seasons: lines };
  }
  return out;
}
