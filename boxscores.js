// Box scores → game log → season totals and standings. Loaded after stats.js
// on stats.html and shares its globals (officeData, category, renderStats, saveStats).
const gameShotPanel = document.querySelector("#game-shot");
const gameShotInput = document.querySelector("#game-shot-input");
const gameShotNote = document.querySelector("#game-shot-note");
const gameShotStop = document.querySelector("#game-shot-stop");
const gameReview = document.querySelector("#game-review");
const gameLogEl = document.querySelector("#game-log");
const gameUnavailable = document.querySelector("#game-unavailable");
const gameShotDefault = gameShotNote.textContent;
let gameSample = null;
let gameImageLimits = null;
let gameController = null;
let pendingGame = null;

const teamStatFields = [
  ["firstDowns", "First downs"], ["totalOffense", "Total offense"], ["totalPlays", "Total plays"],
  ["rushAtt", "Rushes"], ["rushYds", "Rushing yards"], ["rushTd", "Rushing TDs"],
  ["cmp", "Completions"], ["att", "Pass attempts"], ["passTd", "Passing TDs"], ["passYds", "Passing yards"],
  ["thirdConv", "3rd down conv."], ["thirdAtt", "3rd down att."], ["fourthConv", "4th down conv."], ["fourthAtt", "4th down att."],
  ["twoPtConv", "2-pt conv."], ["twoPtAtt", "2-pt att."], ["redZoneTd", "Red zone TDs"], ["redZoneFg", "Red zone FGs"],
  ["turnovers", "Turnovers"], ["fumblesLost", "Fumbles lost"], ["interceptions", "Interceptions thrown"],
  ["puntReturnYds", "Punt return yards"], ["kickReturnYds", "Kick return yards"], ["totalYds", "Total yards"],
  ["puntAvg", "Punt average"], ["penalties", "Penalties"], ["penaltyYds", "Penalty yards"], ["possession", "Possession (mm:ss)"]
];
const playerFields = {
  passing: [["cmp", "Cmp"], ["att", "Att"], ["yds", "Yds"], ["td", "TD"], ["int", "Int"], ["long", "Lng"]],
  rushing: [["att", "Att"], ["yds", "Yds"], ["td", "TD"], ["long", "Lng"]],
  receiving: [["rec", "Rec"], ["yds", "Yds"], ["td", "TD"], ["long", "Lng"]],
  defense: [["tackles", "Tkl"], ["sacks", "Sacks"], ["int", "Int"], ["ff", "FF"], ["fr", "FR"], ["pd", "PD"], ["td", "TD"]],
  kicking: [["fgm", "FGM"], ["fga", "FGA"], ["xpm", "XPM"], ["xpa", "XPA"], ["long", "Lng"]]
};

const gameErrors = {
  not_granted: "Claude wasn't allowed to read screenshots on this page.",
  sampling_disabled: "Reading screenshots isn't available for this account.",
  images_unavailable: "This view can't send screenshots to Claude.",
  image_rejected: "One of those images couldn't be read. Use PNG or JPG screenshots under 20 MB.",
  rate_limited: "Too many requests just now. Wait a minute and try again.",
  session_expired: "Your Claude session expired. Sign in again, then retry.",
  refused: "Claude couldn't read those screenshots. Try clearer screenshots of the box score.",
  invalid_json: "The box score didn't come back in a readable form. Try again, or send fewer screenshots at once.",
  empty_completion: "Nothing was read from those screenshots. Try clearer ones."
};

(async () => {
  try {
    gameSample = await window.claude?.use?.("sample");
    gameImageLimits = gameSample ? (await gameSample.limits().catch(() => null))?.images || null : null;
  } catch {
    gameImageLimits = null;
  }
  if (gameImageLimits) {
    gameShotInput.accept = gameImageLimits.mediaTypes.join(",");
    gameShotPanel.hidden = false;
    gameUnavailable.hidden = true;
  }
})();

// ---------- reading ----------
function boxScorePrompt(count) {
  return [
    `The attached ${count === 1 ? "image is a screenshot" : `${count} images are screenshots`} of ONE American football game's post-game box score from a football video game (for example Madden): team stats pages and/or player stats pages for the same game.`,
    "Read every number shown and reply with only this JSON (no commentary):",
    '{"teams":[{"team":"BUF","score":23},{"team":"LAR","score":20}],',
    ' "teamStats":{"BUF":{"firstDowns":22,"totalOffense":392,"totalPlays":75,"rushAtt":23,"rushYds":86,"rushTd":0,"cmp":35,"att":52,"passTd":2,"passYds":306,"thirdConv":6,"thirdAtt":17,"fourthConv":0,"fourthAtt":0,"twoPtConv":0,"twoPtAtt":0,"redZoneTd":2,"redZoneFg":0,"turnovers":0,"fumblesLost":0,"interceptions":0,"puntReturnYds":17,"kickReturnYds":105,"totalYds":514,"puntAvg":41.6,"penalties":3,"penaltyYds":30,"possession":"29:47"}},',
    ' "players":{"passing":[{"player":"J.Allen","team":"BUF","cmp":34,"att":52,"yds":313,"td":2,"int":0,"long":27}],',
    '  "rushing":[{"player":"...","team":"...","att":0,"yds":0,"td":0,"long":0}],',
    '  "receiving":[{"player":"...","team":"...","rec":0,"yds":0,"td":0,"long":0}],',
    '  "defense":[{"player":"...","team":"...","tackles":0,"sacks":0,"int":0,"ff":0,"fr":0,"pd":0,"td":0}],',
    '  "kicking":[{"player":"...","team":"...","fgm":0,"fga":0,"xpm":0,"xpa":0,"long":0}]}}',
    "Rules:",
    "- teams: the two teams with their FINAL scores, left/first team first. Use standard NFL abbreviations (BUF, LAR, KC, NYJ, ...).",
    "- teamStats: keyed by the same abbreviations. \"23 | 86 | 0\" under RUSHES | YARDS | TDS means rushAtt 23, rushYds 86, rushTd 0. \"35 | 52 | 2\" under COMP | ATT | TDS means cmp, att, passTd. \"6 | 17 (35%)\" under 3RD DOWN CONV. means thirdConv 6, thirdAtt 17. \"2 | 0 | 100%\" under RED ZONE TD | FG | % means redZoneTd 2, redZoneFg 0. \"0 (0)\" under TURNOVERS means 0. \"3 | 30\" under PENALTIES means penalties 3, penaltyYds 30. interceptions = interceptions THROWN by that team.",
    "- players: one entry per player row shown, under the category of the page it appears on, with that row's team. Write names exactly as shown (e.g. J.Allen).",
    "- Use plain numbers (no commas). Use null for any value not shown in these screenshots, and leave out categories that aren't shown. Never invent players or numbers, and list each player once per category."
  ].join("\n");
}

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// "J.Allen" on BUF → "Josh Allen" when exactly one known player fits.
function resolvePlayerName(raw, teamId) {
  const cleaned = String(raw || "").trim();
  const parts = normalizePlayerName(cleaned.replace(/\./g, ". ")).split(" ").filter(Boolean);
  if (!parts.length) return cleaned;
  const last = parts[parts.length - 1];
  const initial = parts.length > 1 ? parts[0][0] : "";
  const known = new Set();
  for (const player of officeData.teams[teamId]?.roster || []) known.add(player.name);
  for (const player of officeData.contractPlayers || []) if (player.team === teamId) known.add(player.name);
  if (typeof nflExperienceSnapshot !== "undefined") {
    for (const [fullName, , team] of nflExperienceSnapshot.players) if (team === teamId) known.add(fullName);
  }
  if (parts.length > 1 && parts[0].length > 1 && [...known].some((name) => normalizePlayerName(name) === normalizePlayerName(cleaned))) return cleaned;
  const fits = [...known].filter((name) => {
    const words = normalizePlayerName(name).split(" ");
    return words[words.length - 1] === last && (!initial || words[0].startsWith(initial));
  });
  const unique = [...new Set(fits.map(normalizePlayerName))];
  return unique.length === 1 ? fits[0] : cleaned;
}

function normalizeGame(result) {
  const teams = (Array.isArray(result?.teams) ? result.teams : []).slice(0, 2).map((side) => ({
    team: lookupTeamId(side?.team) || "", score: toNumber(side?.score) ?? 0
  }));
  const teamStats = {};
  for (const [key, stats] of Object.entries(result?.teamStats || {})) {
    const id = lookupTeamId(key);
    if (!id || !stats || typeof stats !== "object") continue;
    teamStats[id] = Object.fromEntries(teamStatFields.map(([field]) => [field,
      field === "possession" ? (stats.possession ? String(stats.possession).trim().slice(0, 8) : null) : toNumber(stats[field])]));
  }
  const players = {};
  for (const categoryKey of boxScoreCategories) {
    const lines = Array.isArray(result?.players?.[categoryKey]) ? result.players[categoryKey] : [];
    const clean = [];
    for (const line of lines.slice(0, 200)) {
      const team = lookupTeamId(line?.team) || teams.find(({ team: id }) => id)?.team || "";
      if (!line?.player || !team) continue;
      const entry = { player: resolvePlayerName(line.player, team).slice(0, 70), rawName: String(line.player).slice(0, 70), team };
      for (const [field] of playerFields[categoryKey]) entry[field] = toNumber(line[field]);
      clean.push(entry);
    }
    if (clean.length) players[categoryKey] = clean;
  }
  return { teams, teamStats, players };
}

// More screenshots for the same game fill in what the first batch didn't show.
function mergeGames(base, extra) {
  const merged = structuredClone(base);
  if (!merged.teams.length || merged.teams.some(({ team }) => !team)) merged.teams = extra.teams;
  for (const [team, stats] of Object.entries(extra.teamStats)) {
    merged.teamStats[team] = merged.teamStats[team] || {};
    for (const [field, value] of Object.entries(stats)) if (value !== null) merged.teamStats[team][field] = value;
  }
  for (const [categoryKey, lines] of Object.entries(extra.players)) {
    merged.players[categoryKey] = merged.players[categoryKey] || [];
    for (const line of lines) {
      const existing = merged.players[categoryKey].find((other) => other.team === line.team &&
        normalizePlayerName(other.player) === normalizePlayerName(line.player));
      if (existing) for (const [field, value] of Object.entries(line)) { if (value !== null) existing[field] = value; }
      else merged.players[categoryKey].push(line);
    }
  }
  return merged;
}

async function readGameShots(files, addToPending) {
  if (!gameSample || !gameImageLimits || !statsCanSave) return;
  const images = [...files].filter((file) => file.type.startsWith("image/"));
  if (!images.length) return;
  const batch = images.slice(0, gameImageLimits.maxCount);
  gameController?.abort();
  gameController = new AbortController();
  gameShotStop.hidden = false;
  gameShotPanel.classList.add("is-busy");
  gameShotNote.textContent = `Reading ${batch.length === 1 ? "the screenshot" : `${batch.length} screenshots`}… this can take a minute or two.`;
  try {
    const result = await gameSample.json(boxScorePrompt(batch.length), { images: batch, signal: gameController.signal });
    const game = normalizeGame(result);
    if (game.teams.length !== 2 || game.teams.some(({ team }) => !team)) throw { code: "invalid_json" };
    pendingGame = addToPending && pendingGame ? mergeGames(pendingGame, game) : { ...game, week: null, date: localDateString() };
    const skipped = images.length - batch.length;
    gameShotNote.textContent = skipped
      ? `Read ${batch.length} screenshots. ${skipped} more didn't fit in one read: use "Add more screenshots" below for them.`
      : "Check the numbers below, fix anything misread, then click Add game.";
    renderGameReview();
  } catch (error) {
    gameShotNote.textContent = error?.code === "cancelled" ? gameShotDefault : (gameErrors[error?.code] || "Something went wrong reading the screenshots. Try again.");
  } finally {
    gameShotStop.hidden = true;
    gameShotPanel.classList.remove("is-busy");
    gameShotInput.value = "";
    const more = document.querySelector("#game-more-input");
    if (more) more.value = "";
  }
}

// ---------- review ----------
const cellInput = (value, path, { name = false, text = false } = {}) => {
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = name || text ? "text" : "decimal";
  input.value = value ?? "";
  input.dataset.path = path;
  if (name) input.className = "is-name";
  return input;
};

function duplicateOf(game) {
  return (officeData.games || []).find((other) =>
    other.teams.map(({ team, score }) => `${team}${score}`).sort().join() === game.teams.map(({ team, score }) => `${team}${score}`).sort().join() &&
    (game.week == null || other.week == null || other.week === game.week));
}

function renderGameReview() {
  gameReview.replaceChildren();
  if (!pendingGame) {
    gameReview.hidden = true;
    return;
  }
  gameReview.hidden = false;
  const [a, b] = pendingGame.teams;
  const title = document.createElement("h4");
  title.textContent = `${a.team} ${a.score} – ${b.team} ${b.score}`;
  const meta = document.createElement("div");
  meta.className = "game-meta";
  const teamPicker = (index) => {
    const select = document.createElement("select");
    select.dataset.path = `side|${index}|team`;
    for (const { id } of nflTeams) select.add(new Option(id, id));
    select.value = pendingGame.teams[index].team;
    return select;
  };
  const labelled = (text, control) => {
    const label = document.createElement("label");
    label.append(text, control);
    return label;
  };
  const week = cellInput(pendingGame.week, "meta|week");
  week.type = "number";
  week.min = "0";
  week.max = "30";
  const date = cellInput(pendingGame.date, "meta|date", { text: true });
  date.type = "date";
  meta.append(
    labelled("Week", week), labelled("Date", date),
    labelled("Team", teamPicker(0)), labelled("Score", cellInput(a.score, "side|0|score")),
    labelled("Team", teamPicker(1)), labelled("Score", cellInput(b.score, "side|1|score"))
  );
  gameReview.append(title, meta);

  // Team stats: one row per stat, a column per team.
  const teamIds = pendingGame.teams.map(({ team }) => team);
  const teamTable = document.createElement("table");
  const head = teamTable.createTHead().insertRow();
  for (const label of ["Team stat", ...teamIds]) {
    const th = document.createElement("th");
    th.textContent = label;
    head.append(th);
  }
  const body = teamTable.createTBody();
  for (const [field, label] of teamStatFields) {
    const row = body.insertRow();
    row.insertCell().textContent = label;
    for (const id of teamIds) {
      row.insertCell().append(cellInput(pendingGame.teamStats[id]?.[field], `team|${id}|${field}`, { text: field === "possession" }));
    }
  }
  const teamHeading = document.createElement("h5");
  teamHeading.textContent = "Team stats";
  const teamWrap = document.createElement("div");
  teamWrap.className = "game-review-scroll";
  teamWrap.append(teamTable);
  gameReview.append(teamHeading, teamWrap);

  for (const categoryKey of boxScoreCategories) {
    const lines = pendingGame.players[categoryKey] || [];
    if (!lines.length) continue;
    const heading = document.createElement("h5");
    heading.textContent = `${statCategories[categoryKey]} (${lines.length})`;
    const table = document.createElement("table");
    const headRow = table.createTHead().insertRow();
    for (const label of ["Player", "Team", ...playerFields[categoryKey].map(([, l]) => l)]) {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.append(th);
    }
    const tbody = table.createTBody();
    lines.forEach((line, index) => {
      const row = tbody.insertRow();
      const nameInput = cellInput(line.player, `player|${categoryKey}|${index}|player`, { name: true });
      if (line.rawName && line.rawName !== line.player) nameInput.title = `Shown as "${line.rawName}" in the screenshot`;
      row.insertCell().append(nameInput);
      row.insertCell().textContent = line.team;
      for (const [field] of playerFields[categoryKey]) row.insertCell().append(cellInput(line[field], `player|${categoryKey}|${index}|${field}`));
    });
    const wrap = document.createElement("div");
    wrap.className = "game-review-scroll";
    wrap.append(table);
    gameReview.append(heading, wrap);
  }
  if (!Object.keys(pendingGame.players).length) {
    const note = document.createElement("p");
    note.className = "game-warning";
    note.textContent = "No player stats were read yet. Add the player stats screenshots too, or add the game with team stats only.";
    gameReview.append(note);
  }
  const duplicate = duplicateOf(pendingGame);
  if (duplicate) {
    const note = document.createElement("p");
    note.className = "game-warning";
    note.textContent = `A game with this matchup and score${duplicate.week != null ? ` in week ${duplicate.week}` : ""} is already logged. Adding it again would count it twice.`;
    gameReview.append(note);
  }

  const actions = document.createElement("div");
  actions.className = "game-actions";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "button button-lime";
  add.id = "game-add";
  add.textContent = "Add game";
  const moreLabel = document.createElement("label");
  moreLabel.className = "workspace-button";
  moreLabel.htmlFor = "game-more-input";
  moreLabel.textContent = "Add more screenshots";
  const moreInput = document.createElement("input");
  moreInput.type = "file";
  moreInput.id = "game-more-input";
  moreInput.multiple = true;
  moreInput.hidden = true;
  moreInput.accept = gameShotInput.accept;
  moreInput.addEventListener("change", () => {
    collectReview();
    readGameShots(moreInput.files, true);
  });
  const discard = document.createElement("button");
  discard.type = "button";
  discard.className = "workspace-button";
  discard.id = "game-discard";
  discard.textContent = "Discard";
  actions.append(add, moreLabel, moreInput, discard);
  gameReview.append(actions);
}

// Read the review inputs back into pendingGame.
function collectReview() {
  if (!pendingGame) return;
  for (const input of gameReview.querySelectorAll("[data-path]")) {
    const [kind, a, b, c] = input.dataset.path.split("|");
    const raw = input.value.trim();
    if (kind === "meta") pendingGame[a] = a === "week" ? (raw === "" ? null : Math.round(Number(raw))) : raw;
    else if (kind === "side") pendingGame.teams[Number(a)][b] = b === "score" ? (toNumber(raw) ?? 0) : raw;
    else if (kind === "team") {
      pendingGame.teamStats[a] = pendingGame.teamStats[a] || {};
      pendingGame.teamStats[a][b] = b === "possession" ? (raw || null) : toNumber(raw);
    } else if (kind === "player") {
      const line = pendingGame.players[a][Number(b)];
      line[c] = c === "player" ? raw.slice(0, 70) : toNumber(raw);
    }
  }
}

gameReview.addEventListener("click", (event) => {
  if (event.target.id === "game-discard") {
    pendingGame = null;
    gameShotNote.textContent = gameShotDefault;
    renderGameReview();
  } else if (event.target.id === "game-add") {
    collectReview();
    addGame();
  }
});

// ---------- applying ----------
function applyGameToStandings(game) {
  if (!officeData.standings) officeData.standings = { season: currentLeagueYear(), teams: {} };
  game.standingsBefore = {};
  game.streakAfter = {};
  const [a, b] = game.teams;
  for (const [side, other] of [[a, b], [b, a]]) {
    const before = teamRecord(officeData, side.team);
    game.standingsBefore[side.team] = { ...before };
    const record = { ...before };
    const result = side.score > other.score ? "W" : side.score < other.score ? "L" : "T";
    record[result.toLowerCase()] = Math.min(30, record[result.toLowerCase()] + 1);
    record.pf = Math.min(2000, record.pf + side.score);
    record.pa = Math.min(2000, record.pa + other.score);
    const match = String(record.streak || "").match(/^([WLT])(\d+)$/);
    record.streak = match && match[1] === result ? `${result}${Number(match[2]) + 1}` : `${result}1`;
    game.streakAfter[side.team] = record.streak;
    officeData.standings.teams[side.team] = record;
  }
}

function removeGameFromStandings(game) {
  const [a, b] = game.teams;
  for (const [side, other] of [[a, b], [b, a]]) {
    const record = { ...teamRecord(officeData, side.team) };
    const result = side.score > other.score ? "w" : side.score < other.score ? "l" : "t";
    record[result] = Math.max(0, record[result] - 1);
    record.pf = Math.max(0, record.pf - side.score);
    record.pa = Math.max(0, record.pa - other.score);
    if (record.streak === game.streakAfter?.[side.team]) record.streak = game.standingsBefore?.[side.team]?.streak || "";
    officeData.standings.teams[side.team] = record;
  }
}

function addGame() {
  const game = pendingGame;
  if (!game || game.teams[0].team === game.teams[1].team || game.teams.some(({ team }) => !nflTeams.some(({ id }) => id === team))) {
    statsStatus.textContent = "Pick two different teams before adding the game.";
    return;
  }
  // Team stats re-keyed if a team was changed in the review.
  const ids = game.teams.map(({ team }) => team);
  const teamStats = {};
  Object.entries(game.teamStats).forEach(([id, stats], index) => { teamStats[ids.includes(id) ? id : ids[index] || id] = stats; });
  const record = {
    id: newRecordId("game"),
    date: game.date || localDateString(),
    week: Number.isInteger(game.week) ? game.week : null,
    teams: game.teams.map(({ team, score }) => ({ team, score: Math.max(0, Math.round(score)) })),
    teamStats: Object.fromEntries(Object.entries(teamStats).filter(([id]) => ids.includes(id))),
    players: Object.fromEntries(Object.entries(game.players).map(([key, lines]) => [key,
      lines.filter((line) => line.player).map((line) => ({ ...line, team: ids.includes(line.team) ? line.team : ids[0] }))])),
    addedAt: new Date().toISOString()
  };
  officeData.games = officeData.games || [];
  applyGameToStandings(record);
  officeData.games.push(record);
  pendingGame = null;
  gameShotNote.textContent = gameShotDefault;
  const [a, b] = record.teams;
  saveStats(`Added ${a.team} ${a.score} – ${b.team} ${b.score}${record.week != null ? ` (week ${record.week})` : ""}. Season stats and standings were updated.`);
  renderGameReview();
  renderGameLog();
  renderStats();
}

function renderGameLog() {
  const games = [...(officeData.games || [])].sort((x, y) =>
    (y.week ?? -1) - (x.week ?? -1) || y.date.localeCompare(x.date) || String(y.addedAt).localeCompare(String(x.addedAt)));
  gameLogEl.replaceChildren();
  if (!games.length) return;
  const heading = document.createElement("h5");
  heading.textContent = `Games added (${games.length})`;
  const list = document.createElement("ul");
  for (const game of games) {
    const item = document.createElement("li");
    item.dataset.gameId = game.id;
    const text = document.createElement("span");
    const [a, b] = game.teams;
    text.textContent = `${a.team} ${a.score} – ${b.team} ${b.score}`;
    const meta = document.createElement("small");
    meta.textContent = `${game.week != null ? `Week ${game.week} · ` : ""}${game.date}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-delete";
    remove.dataset.action = "remove-game";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove this game and undo its stats and standings");
    item.append(text, meta, remove);
    list.append(item);
  }
  gameLogEl.append(heading, list);
}

gameLogEl.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="remove-game"]');
  const item = button?.closest("[data-game-id]");
  if (!item || !statsCanSave) return;
  if (!button.classList.contains("is-armed")) {
    button.classList.add("is-armed");
    button.textContent = "Remove?";
    setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove("is-armed");
      button.textContent = "×";
    }, 4000);
    return;
  }
  removeGameById(item.dataset.gameId);
});

function removeGameById(gameId) {
  const game = (officeData.games || []).find(({ id }) => id === gameId);
  if (!game) return;
  removeGameFromStandings(game);
  officeData.games = officeData.games.filter(({ id }) => id !== game.id);
  const [a, b] = game.teams;
  saveStats(`Removed ${a.team} ${a.score} – ${b.team} ${b.score}. Its stats and standings were taken back out.`);
  renderGameLog();
  renderStats();
}

function armThenRun(button, run) {
  if (!button.classList.contains("is-armed")) {
    button.classList.add("is-armed");
    button.textContent = "Remove?";
    setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove("is-armed");
      button.textContent = "×";
    }, 4000);
    return;
  }
  run();
}

// ---------- Game Scores tab ----------
let scoresTeamFilter = "";

function teamLogo(teamId) {
  const wrap = document.createElement("span");
  wrap.className = "team-monogram standings-logo";
  const image = document.createElement("img");
  image.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${nflTeams.find(({ id }) => id === teamId).logo}.png`;
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", () => { image.remove(); wrap.textContent = teamId; }, { once: true });
  wrap.append(image);
  return wrap;
}

function renderScoresView() {
  const view = document.querySelector("#scores-view");
  view.replaceChildren();
  const games = officeData.games || [];

  // Quick score entry (no screenshots): updates standings like a box score.
  if (statsCanSave) {
    const form = document.createElement("form");
    form.className = "management-form scores-form";
    form.id = "scores-form";
    const field = (label, control) => {
      const wrap = document.createElement("label");
      wrap.append(label, control);
      return wrap;
    };
    const teamSelect = (name) => {
      const select = document.createElement("select");
      select.name = name;
      select.required = true;
      select.add(new Option("Team", ""));
      for (const { id, name: full } of nflTeams) select.add(new Option(`${full} (${id})`, id));
      return select;
    };
    const number = (name, min, max, placeholder = "") => {
      const input = document.createElement("input");
      input.type = "number";
      input.name = name;
      input.min = String(min);
      input.max = String(max);
      input.step = "1";
      input.placeholder = placeholder;
      return input;
    };
    const scoreA = number("scoreA", 0, 200, "0");
    const scoreB = number("scoreB", 0, 200, "0");
    scoreA.required = scoreB.required = true;
    const date = document.createElement("input");
    date.type = "date";
    date.name = "date";
    date.value = localDateString();
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "button button-lime add-button";
    submit.textContent = "Add score +";
    form.append(field("Week", number("week", 0, 30)), field("Team", teamSelect("teamA")), field("Score", scoreA),
      field("Team", teamSelect("teamB")), field("Score", scoreB), field("Date", date), submit);
    const hint = document.createElement("p");
    hint.className = "scores-hint";
    hint.textContent = "Add a final score here, or add a full box score under Update stats. Either way the standings update.";
    view.append(form, hint);
  }

  // Team filter.
  const teamsPlayed = [...new Set(games.flatMap((game) => game.teams.map(({ team }) => team)))].sort((x, y) => teamName(x).localeCompare(teamName(y)));
  if (!teamsPlayed.includes(scoresTeamFilter)) scoresTeamFilter = "";
  if (games.length) {
    const filterBar = document.createElement("div");
    filterBar.className = "contracts-toolbar scores-filter";
    const label = document.createElement("label");
    label.textContent = "Team";
    const select = document.createElement("select");
    select.id = "scores-team";
    select.add(new Option("All teams", ""));
    for (const id of teamsPlayed) select.add(new Option(`${teamName(id)} (${id})`, id));
    select.value = scoresTeamFilter;
    label.append(select);
    filterBar.append(label);
    view.append(filterBar);
  }

  const shown = games.filter((game) => !scoresTeamFilter || game.teams.some(({ team }) => team === scoresTeamFilter));
  if (!shown.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = games.length ? "No games for this team yet." : "No games yet. Add a score above or a box score under Update stats.";
    view.append(empty);
    return;
  }
  // Group by week, newest first.
  const weeks = new Map();
  for (const game of [...shown].sort((x, y) => (y.week ?? -1) - (x.week ?? -1) || y.date.localeCompare(x.date) || String(y.addedAt).localeCompare(String(x.addedAt)))) {
    const key = game.week ?? "none";
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(game);
  }
  for (const [week, list] of weeks) {
    const heading = document.createElement("h3");
    heading.className = "scores-week";
    heading.textContent = week === "none" ? "No week set" : `Week ${week}`;
    const grid = document.createElement("div");
    grid.className = "scores-grid";
    for (const game of list) {
      const card = document.createElement("article");
      card.className = "score-card";
      card.dataset.gameId = game.id;
      const [a, b] = game.teams;
      for (const [side, other] of [[a, b], [b, a]]) {
        const line = document.createElement("div");
        line.className = `score-line${side.score > other.score ? " is-winner" : ""}`;
        const name = document.createElement("a");
        name.href = `team.html?team=${encodeURIComponent(side.team)}`;
        name.textContent = teamName(side.team);
        const score = document.createElement("strong");
        score.textContent = String(side.score);
        line.append(teamLogo(side.team), name, score);
        card.append(line);
      }
      const foot = document.createElement("div");
      foot.className = "score-foot";
      const info = document.createElement("small");
      const hasBox = Object.keys(game.teamStats || {}).length || Object.keys(game.players || {}).length;
      info.textContent = `FINAL · ${game.date}${hasBox ? " · box score" : ""}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "row-delete";
      remove.dataset.action = "remove-score";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove this game and undo its stats and standings");
      if (!statsCanSave) remove.hidden = true;
      foot.append(info, remove);
      card.append(foot);
      grid.append(card);
    }
    view.append(heading, grid);
  }
}

document.querySelector("#scores-view").addEventListener("change", (event) => {
  if (event.target.id !== "scores-team") return;
  scoresTeamFilter = event.target.value;
  renderScoresView();
});

document.querySelector("#scores-view").addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="remove-score"]');
  const card = button?.closest("[data-game-id]");
  if (!card || !statsCanSave) return;
  armThenRun(button, () => removeGameById(card.dataset.gameId));
});

document.querySelector("#scores-view").addEventListener("submit", (event) => {
  if (event.target.id !== "scores-form") return;
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const teamA = form.elements.teamA.value;
  const teamB = form.elements.teamB.value;
  if (teamA === teamB) {
    statsStatus.textContent = "Pick two different teams.";
    form.elements.teamB.focus();
    return;
  }
  const weekText = form.elements.week.value.trim();
  const game = {
    id: newRecordId("game"),
    date: form.elements.date.value || localDateString(),
    week: weekText === "" ? null : Math.round(Number(weekText)),
    teams: [{ team: teamA, score: Math.round(Number(form.elements.scoreA.value)) }, { team: teamB, score: Math.round(Number(form.elements.scoreB.value)) }],
    teamStats: {},
    players: {},
    addedAt: new Date().toISOString()
  };
  if (duplicateOf(game)) {
    statsStatus.textContent = "That matchup and score is already logged for this week. It wasn't added again.";
    return;
  }
  officeData.games = officeData.games || [];
  applyGameToStandings(game);
  officeData.games.push(game);
  const [a, b] = game.teams;
  saveStats(`Added ${teamName(a.team)} ${a.score} – ${teamName(b.team)} ${b.score}${game.week != null ? ` (week ${game.week})` : ""}. Standings were updated.`);
  renderGameLog();
  renderStats();
});

gameShotInput.addEventListener("change", () => readGameShots(gameShotInput.files, false));
gameShotStop.addEventListener("click", () => gameController?.abort());
const gamePanel = document.querySelector("#game-import-panel");
gamePanel.addEventListener("dragover", (event) => {
  if (!gameImageLimits) return;
  event.preventDefault();
  gamePanel.classList.add("is-dropping");
});
gamePanel.addEventListener("dragleave", () => gamePanel.classList.remove("is-dropping"));
gamePanel.addEventListener("drop", (event) => {
  gamePanel.classList.remove("is-dropping");
  const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length || !gameImageLimits) return;
  event.preventDefault();
  readGameShots(files, Boolean(pendingGame));
});
document.addEventListener("paste", (event) => {
  if (!gameImageLimits || !gamePanel.open || event.target.closest?.("#stats-import-panel")) return;
  const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  readGameShots(files, Boolean(pendingGame));
});

renderGameLog();
renderStats();
