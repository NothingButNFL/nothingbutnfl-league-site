// Season totals built from the game log (box scores), plus small helpers for
// reading stat tables. Shared by the Stats page and the Overview leaders.
// ---------- season totals from the game log ----------
const sum = (values) => values.reduce((total, value) => total + (value ?? 0), 0);
const anyValue = (values) => values.some((value) => value !== null && value !== undefined);
const int = (n) => (n === null ? "" : Math.round(n).toLocaleString("en-US"));
const one = (n) => (n === null || !Number.isFinite(n) ? "" : n.toFixed(1));
const pctText = (made, tries) => (tries ? `${((made / tries) * 100).toFixed(1)}%` : "");
const toSeconds = (text) => {
  const match = String(text || "").match(/^(\d+):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function passerRating(cmp, att, yds, td, ints) {
  if (!att) return null;
  const clamp = (x) => Math.max(0, Math.min(2.375, x));
  const a = clamp((cmp / att - 0.3) * 5);
  const b = clamp((yds / att - 3) * 0.25);
  const c = clamp((td / att) * 20);
  const d = clamp(2.375 - (ints / att) * 25);
  return ((a + b + c + d) / 6) * 100;
}

function gameTables(data = officeData) {
  const games = data.games || [];
  if (!games.length) return {};
  const tables = {};

  // Team totals.
  const byTeam = new Map();
  for (const game of games) {
    game.teams.forEach((side, index) => {
      const other = game.teams[1 - index];
      const entry = byTeam.get(side.team) || { gp: 0, w: 0, l: 0, t: 0, pf: 0, pa: 0, stats: [] };
      entry.gp += 1;
      entry[side.score > other.score ? "w" : side.score < other.score ? "l" : "t"] += 1;
      entry.pf += side.score;
      entry.pa += other.score;
      entry.stats.push(game.teamStats[side.team] || {});
      byTeam.set(side.team, entry);
    });
  }
  const field = (entry, key) => (anyValue(entry.stats.map((s) => s[key])) ? sum(entry.stats.map((s) => s[key])) : null);
  tables.team = {
    headers: ["Team", "GP", "W", "L", "T", "PF", "PA", "1st D", "Tot Yds", "Plays", "Yds/Play", "Rush", "Rush Yds", "Rush TD", "Yds/Rush",
      "Cmp", "Att", "Pass Yds", "Pass TD", "3rd Down", "3rd %", "4th Down", "RZ TD", "RZ FG", "TO", "Fum Lost", "Int", "PR Yds", "KR Yds", "Pen", "Pen Yds", "TOP"],
    rows: [...byTeam.entries()].sort((x, y) => teamName(x[0]).localeCompare(teamName(y[0]))).map(([team, e]) => {
      const offense = field(e, "totalOffense");
      const plays = field(e, "totalPlays");
      const rush = field(e, "rushAtt");
      const rushYds = field(e, "rushYds");
      const third = [field(e, "thirdConv"), field(e, "thirdAtt")];
      const fourth = [field(e, "fourthConv"), field(e, "fourthAtt")];
      const top = e.stats.map((s) => toSeconds(s.possession)).filter((s) => s !== null);
      return [teamName(team), e.gp, e.w, e.l, e.t, e.pf, e.pa, field(e, "firstDowns"), offense, plays,
        plays ? one(offense / plays) : "", rush, rushYds, field(e, "rushTd"), rush ? one(rushYds / rush) : "",
        field(e, "cmp"), field(e, "att"), field(e, "passYds"), field(e, "passTd"),
        third[1] !== null ? `${third[0] ?? 0}/${third[1]}` : "", pctText(third[0] ?? 0, third[1]),
        fourth[1] !== null ? `${fourth[0] ?? 0}/${fourth[1]}` : "", field(e, "redZoneTd"), field(e, "redZoneFg"),
        field(e, "turnovers"), field(e, "fumblesLost"), field(e, "interceptions"), field(e, "puntReturnYds"), field(e, "kickReturnYds"),
        field(e, "penalties"), field(e, "penaltyYds"), top.length ? clock(sum(top)) : ""
      ].map((value) => (typeof value === "number" ? int(value) : String(value ?? "")));
    })
  };

  // Player totals per category.
  for (const categoryKey of boxScoreCategories) {
    const players = new Map();
    for (const game of games) {
      for (const line of game.players?.[categoryKey] || []) {
        const key = `${normalizePlayerName(line.player)}|${line.team}`;
        const entry = players.get(key) || { player: line.player, team: line.team, gp: 0, lines: [] };
        entry.gp += 1;
        entry.lines.push(line);
        players.set(key, entry);
      }
    }
    if (!players.size) continue;
    const total = (entry, key) => sum(entry.lines.map((line) => line[key]));
    const longest = (entry) => (anyValue(entry.lines.map((line) => line.long)) ? Math.max(...entry.lines.map((line) => line.long ?? 0)) : null);
    const list = [...players.values()];
    if (categoryKey === "passing") {
      tables.passing = { headers: ["Player", "Team", "GP", "Cmp", "Att", "Cmp%", "Yds", "TD", "Int", "Avg", "Lng", "Rate"], rows: list.map((e) => {
        const [cmp, att, yds, td, ints] = ["cmp", "att", "yds", "td", "int"].map((k) => total(e, k));
        return [e.player, e.team, int(e.gp), int(cmp), int(att), pctText(cmp, att), int(yds), int(td), int(ints), att ? one(yds / att) : "", int(longest(e)), one(passerRating(cmp, att, yds, td, ints))];
      }) };
    } else if (categoryKey === "rushing") {
      tables.rushing = { headers: ["Player", "Team", "GP", "Att", "Yds", "Avg", "TD", "Lng"], rows: list.map((e) => {
        const [att, yds] = [total(e, "att"), total(e, "yds")];
        return [e.player, e.team, int(e.gp), int(att), int(yds), att ? one(yds / att) : "", int(total(e, "td")), int(longest(e))];
      }) };
    } else if (categoryKey === "receiving") {
      tables.receiving = { headers: ["Player", "Team", "GP", "Rec", "Yds", "Avg", "TD", "Lng"], rows: list.map((e) => {
        const [rec, yds] = [total(e, "rec"), total(e, "yds")];
        return [e.player, e.team, int(e.gp), int(rec), int(yds), rec ? one(yds / rec) : "", int(total(e, "td")), int(longest(e))];
      }) };
    } else if (categoryKey === "defense") {
      tables.defense = { headers: ["Player", "Team", "GP", "Tkl", "Sacks", "Int", "FF", "FR", "PD", "TD"], rows: list.map((e) =>
        [e.player, e.team, int(e.gp), int(total(e, "tackles")), one(total(e, "sacks")).replace(/\.0$/, ""), int(total(e, "int")), int(total(e, "ff")), int(total(e, "fr")), int(total(e, "pd")), int(total(e, "td"))]) };
    } else if (categoryKey === "kicking") {
      tables.kicking = { headers: ["Player", "Team", "GP", "FGM", "FGA", "FG%", "XPM", "XPA", "Lng", "Pts"], rows: list.map((e) => {
        const [fgm, fga, xpm, xpa] = ["fgm", "fga", "xpm", "xpa"].map((k) => total(e, k));
        return [e.player, e.team, int(e.gp), int(fgm), int(fga), pctText(fgm, fga), int(xpm), int(xpa), int(longest(e)), int(fgm * 3 + xpm)];
      }) };
    }
  }
  for (const table of Object.values(tables)) table.fromGames = games.length;
  return tables;
}

// The table a stat category shows: box-score totals once games exist, otherwise the pasted table.
function statTableFor(data, key) {
  return gameTables(data)[key] || data.stats?.tables?.[key] || null;
}

const statHeaderKey = (header) => String(header).toUpperCase().replace(/[^A-Z0-9]/g, "");

function statColumn(table, pattern) {
  return table.headers.findIndex((header) => pattern.test(statHeaderKey(header)));
}

function statNameColumn(table) {
  const player = statColumn(table, /^(PLAYER|NAME|PLAYERNAME|FULLNAME)$/);
  if (player !== -1) return player;
  const team = statColumn(table, /^(TEAM|TM|CLUB)$/);
  return team !== -1 ? team : 0;
}

function statTeamColumn(table) {
  return statColumn(table, /^(TEAM|TM|CLUB)$/);
}

function statNumber(text) {
  const cleaned = String(text ?? "").trim().replace(/[,%+]/g, "");
  return cleaned !== "" && /^-?\d*\.?\d+$/.test(cleaned) ? Number(cleaned) : null;
}

// Top players for one stat column: [{name, team, value, display}].
function statLeaders(data, key, pattern, count = 5) {
  const table = statTableFor(data, key);
  if (!table || !table.rows.length) return null;
  const valueIndex = statColumn(table, pattern);
  if (valueIndex === -1) return [];
  const nameIndex = statNameColumn(table);
  const teamIndex = statTeamColumn(table);
  return table.rows
    .map((row) => ({ row, value: statNumber(row[valueIndex]) }))
    .filter(({ value }) => value !== null && value > 0) // a leader needs at least one
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map(({ row, value }) => ({
      name: row[nameIndex] || "—",
      team: teamIndex !== -1 && teamIndex !== nameIndex ? (lookupTeamId(row[teamIndex]) || row[teamIndex] || "") : "",
      value,
      display: row[valueIndex]
    }));
}
