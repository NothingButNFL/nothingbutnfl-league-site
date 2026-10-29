// Stats page. Each category is a table pasted from the league's sim or spreadsheet,
// stored as-is in officeData.stats.tables[category] = { headers, rows }.
const statsTabs = document.querySelector("#stats-tabs");
const statsTable = document.querySelector("#stats-table");
const statsLeaders = document.querySelector("#stats-leaders");
const statsStatus = document.querySelector("#stats-status");
const statsEmpty = document.querySelector("#stats-empty");
const statsCount = document.querySelector("#stats-count");
const statsSearch = document.querySelector("#stats-search");
const statsTeamFilter = document.querySelector("#stats-team");
const statsEditor = document.querySelector("#stats-editor");
const statsEditToggle = document.querySelector("#stats-edit");
const statsSeasonInput = document.querySelector("#stats-season-input");

let officeData = emptyOfficeData();
let statsCanSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch {
  statsCanSave = false;
  statsEditToggle.hidden = true;
}
let category = "passing";
let sortState = null; // { index, direction }
let editingStats = false;

// Headline stats for the leader cards: [header pattern, label, lowest-is-best].
const leaderSpecs = {
  passing: [[/^(PASS)?(YDS|YARDS)$/, "Passing yards"], [/^(PASS)?TDS?$/, "Passing touchdowns"], [/^(RATE|RTG|RATING|PASSERRATING|QBR)$/, "Passer rating"]],
  rushing: [[/^(RUSH)?(YDS|YARDS)$/, "Rushing yards"], [/^(RUSH)?TDS?$/, "Rushing touchdowns"], [/^(ATT|CAR|CARRIES|RUSHATT)$/, "Carries"]],
  receiving: [[/^(REC|RECEPTIONS)$/, "Receptions"], [/^(REC)?(YDS|YARDS)$/, "Receiving yards"], [/^(REC)?TDS?$/, "Receiving touchdowns"]],
  defense: [[/^(TKL|TACKLES|COMB|TOT|TOTAL|TOTALTACKLES)$/, "Tackles"], [/^(SACKS?|SCK|SK)$/, "Sacks"], [/^(INT|INTS|INTERCEPTIONS)$/, "Interceptions"]],
  kicking: [[/^(FGM|FG)$/, "Field goals made"], [/^(PTS|POINTS)$/, "Points"], [/^(LNG|LONG)$/, "Longest kick"]],
  team: [[/^(PF|PTS|POINTS|PTSFOR|POINTSFOR)$/, "Points scored"], [/^(YDS|TOTYDS|YARDS|TOTALYARDS|TOTALYDS)$/, "Total yards"], [/^(PA|PTSAGAINST|POINTSAGAINST|POINTSALLOWED)$/, "Fewest points allowed", true]]
};
const normalizeHeader = (header) => header.toUpperCase().replace(/[^A-Z0-9]/g, "");

function ensureStats() {
  if (!officeData.stats) officeData.stats = { season: currentLeagueYear(), tables: {} };
  return officeData.stats;
}

// Box scores (boxscores.js) build the tables once any game is logged; otherwise
// the pasted table for the category is shown.
function tableFor(key) {
  const built = typeof gameTables === "function" ? gameTables()[key] : null;
  return built || officeData.stats?.tables?.[key] || null;
}

function currentTable() {
  return tableFor(category);
}

function saveStats(message) {
  try {
    writeStoredOffice(officeData);
    statsStatus.textContent = message;
  } catch (error) {
    statsStatus.textContent = `Could not save: ${error.message}. Very large tables may not fit in browser storage.`;
  }
}

function parseNumber(text) {
  const cleaned = String(text).trim().replace(/[,%+]/g, "");
  return cleaned !== "" && /^-?\d*\.?\d+$/.test(cleaned) ? Number(cleaned) : null;
}

function findColumn(headers, pattern) {
  return headers.findIndex((header) => pattern.test(normalizeHeader(header)));
}

function nameColumn(table) {
  const player = findColumn(table.headers, /^(PLAYER|NAME|PLAYERNAME|FULLNAME)$/);
  if (player !== -1) return player;
  const team = findColumn(table.headers, /^(TEAM|TM|CLUB)$/);
  return team !== -1 ? team : 0;
}

function teamColumn(table) {
  return findColumn(table.headers, /^(TEAM|TM|CLUB)$/);
}

function isNumericColumn(table, index) {
  const values = table.rows.map((row) => row[index]).filter((value) => value && value.trim());
  return values.length > 0 && values.filter((value) => parseNumber(value) !== null).length / values.length >= 0.8;
}

function teamIdForCell(text) {
  return lookupTeamId(text);
}

// Stat tabs plus the Game Scores tab (scores come from the game log in boxscores.js).
const statsTabList = { ...statCategories, scores: "Game Scores" };

function renderTabs() {
  statsTabs.replaceChildren(...Object.entries(statsTabList).map(([key, label]) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `tab-button${key === category ? " is-active" : ""}`;
    tab.id = `stats-tab-${key}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(key === category));
    tab.tabIndex = key === category ? 0 : -1;
    tab.dataset.category = key;
    const rows = key === "scores" ? (officeData.games || []).length : tableFor(key)?.rows.length || 0;
    tab.textContent = label;
    if (!rows) tab.classList.add("is-empty");
    return tab;
  }));
}

function leaderCards(table) {
  const nameIndex = nameColumn(table);
  const teamIndex = teamColumn(table);
  let specs = leaderSpecs[category]
    .map(([pattern, label, ascending]) => ({ index: findColumn(table.headers, pattern), label, ascending }))
    .filter(({ index }) => index !== -1 && index !== nameIndex && isNumericColumn(table, index));
  if (!specs.length) {
    // Fall back to the first numeric columns that aren't games or ages.
    specs = table.headers.map((header, index) => ({ index, label: header }))
      .filter(({ index, label }) => index !== nameIndex && index !== teamIndex &&
        !/^(GP|G|GS|AGE|NO|NUM|RK|RANK|YR|YEAR|SEASON|#)$/.test(normalizeHeader(label)) && isNumericColumn(table, index))
      .slice(0, 3);
  }
  return specs.slice(0, 3).map(({ index, label, ascending }) => {
    const ranked = table.rows
      .map((row) => ({ row, value: parseNumber(row[index] ?? "") }))
      .filter(({ value }) => value !== null)
      .sort((a, b) => (ascending ? a.value - b.value : b.value - a.value))
      .slice(0, 5);
    const card = document.createElement("article");
    card.className = "stats-leader-card";
    const title = document.createElement("h3");
    title.textContent = label;
    const column = document.createElement("span");
    column.className = "stats-leader-column";
    column.textContent = table.headers[index];
    const list = document.createElement("ol");
    for (const { row } of ranked) {
      const item = document.createElement("li");
      const who = document.createElement("span");
      who.className = "stats-leader-name";
      who.textContent = row[nameIndex] || "—";
      if (teamIndex !== -1 && teamIndex !== nameIndex && row[teamIndex]) {
        const team = document.createElement("small");
        team.textContent = row[teamIndex];
        who.append(team);
      }
      const value = document.createElement("strong");
      value.textContent = row[index];
      item.append(who, value);
      list.append(item);
    }
    card.append(title, column, list);
    return card;
  });
}

function renderStats() {
  // Team stats (32 rows) show in full, compact, with no inner scrolling.
  document.querySelector(".stats-table-wrap").classList.toggle("is-compact", category === "team");
  const stats = ensureStats();
  document.querySelector("#stats-season").textContent = String(stats.season);
  statsSeasonInput.value = String(stats.season);
  const scoresView = document.querySelector("#scores-view");
  const showScores = category === "scores";
  for (const selector of ["#stats-leaders", ".stats-filters", ".stats-table-wrap", "#stats-import-panel"]) {
    document.querySelector(selector).hidden = showScores;
  }
  scoresView.hidden = !showScores;
  if (showScores) {
    statsEmpty.hidden = true;
    document.querySelector("#stats-note").textContent = `${(officeData.games || []).length} ${(officeData.games || []).length === 1 ? "game" : "games"}`;
    renderTabs();
    if (typeof renderScoresView === "function") renderScoresView();
    return;
  }
  document.querySelector("#stats-import-category").textContent = statCategories[category];
  renderTabs();
  const table = currentTable();

  // Team filter from the teams that appear in this table.
  const keepTeam = statsTeamFilter.value;
  const teamIndex = table ? teamColumn(table) : -1;
  const teams = teamIndex === -1 ? [] : [...new Set(table.rows.map((row) => teamIdForCell(row[teamIndex] || "")).filter(Boolean))]
    .sort((a, b) => teamName(a).localeCompare(teamName(b)));
  statsTeamFilter.replaceChildren(new Option("All teams", ""), ...teams.map((id) => new Option(`${teamName(id)} (${id})`, id)));
  statsTeamFilter.value = teams.includes(keepTeam) ? keepTeam : "";
  statsTeamFilter.disabled = !teams.length;

  if (!table || !table.rows.length) {
    statsLeaders.replaceChildren();
    statsTable.replaceChildren();
    statsCount.textContent = "0";
    statsEmpty.hidden = false;
    statsEmpty.textContent = `No ${statCategories[category].toLowerCase()} stats yet. Click Update stats and paste the table from your sim or spreadsheet.`;
    document.querySelector("#stats-note").textContent = "";
    return;
  }
  statsEmpty.hidden = true;
  statsLeaders.replaceChildren(...leaderCards(table));

  const query = statsSearch.value.trim().toLowerCase();
  let rows = table.rows.filter((row) =>
    (!query || row.join(" ").toLowerCase().includes(query)) &&
    (!statsTeamFilter.value || teamIdForCell(row[teamIndex] || "") === statsTeamFilter.value));
  if (sortState) {
    const { index, direction } = sortState;
    const numeric = isNumericColumn(table, index);
    rows = [...rows].sort((a, b) => {
      const av = numeric ? parseNumber(a[index] ?? "") : (a[index] || "").toLowerCase();
      const bv = numeric ? parseNumber(b[index] ?? "") : (b[index] || "").toLowerCase();
      if (av === null || av === "") return 1;
      if (bv === null || bv === "") return -1;
      return (numeric ? av - bv : String(av).localeCompare(String(bv))) * direction;
    });
  }

  const nameIndex = nameColumn(table);
  const head = document.createElement("thead");
  const headRow = head.insertRow();
  table.headers.forEach((header, index) => {
    const th = document.createElement("th");
    th.scope = "col";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "contracts-sort";
    button.dataset.sortIndex = String(index);
    const active = sortState?.index === index;
    button.textContent = `${header}${active ? (sortState.direction === -1 ? " ▼" : " ▲") : ""}`;
    th.setAttribute("aria-sort", active ? (sortState.direction === -1 ? "descending" : "ascending") : "none");
    if (isNumericColumn(table, index)) th.className = "is-number";
    th.append(button);
    headRow.append(th);
  });
  const body = document.createElement("tbody");
  const numericColumns = table.headers.map((_, index) => isNumericColumn(table, index));
  for (const row of rows) {
    const tr = body.insertRow();
    table.headers.forEach((_, index) => {
      const td = tr.insertCell();
      const value = row[index] ?? "";
      if (index === teamIndex && teamIdForCell(value)) {
        const link = document.createElement("a");
        link.href = `team.html?team=${encodeURIComponent(teamIdForCell(value))}`;
        link.textContent = value;
        td.append(link);
      } else {
        td.textContent = value;
      }
      if (index === nameIndex) {
        td.className = "stats-name";
        const found = typeof findPlayerByName === "function" ? findPlayerByName(officeData, value, lookupTeamId(row[teamIndex] || "")) : null;
        if (found && category !== "team") {
          td.replaceChildren();
          const link = document.createElement("a");
          link.href = profileUrl(found.player.id);
          link.textContent = value;
          td.append(link);
        }
      }
      else if (numericColumns[index]) td.className = "is-number";
    });
  }
  statsTable.replaceChildren(head, body);
  statsCount.textContent = rows.length.toLocaleString("en-US");
  document.querySelector("#stats-note").textContent = table.fromGames
    ? `${table.rows.length} ${table.rows.length === 1 ? "row" : "rows"} · season totals from ${table.fromGames} ${table.fromGames === 1 ? "box score" : "box scores"}`
    : `${table.rows.length} ${table.rows.length === 1 ? "row" : "rows"}${table.updatedAt ? ` · updated ${new Date(table.updatedAt).toLocaleDateString("en-US")}` : ""}`;
}

statsTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-category]");
  if (!tab) return;
  category = tab.dataset.category;
  sortState = null;
  statsSearch.value = "";
  statsTeamFilter.value = "";
  renderStats();
});
statsTabs.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const keys = Object.keys(statsTabList);
  category = keys[(keys.indexOf(category) + (event.key === "ArrowRight" ? 1 : keys.length - 1)) % keys.length];
  sortState = null;
  renderStats();
  document.querySelector(`#stats-tab-${category}`).focus();
});

statsTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort-index]");
  if (!button) return;
  const index = Number(button.dataset.sortIndex);
  const numeric = isNumericColumn(currentTable(), index);
  sortState = sortState?.index === index
    ? { index, direction: -sortState.direction }
    : { index, direction: numeric ? -1 : 1 }; // numbers start highest-first
  renderStats();
});

statsSearch.addEventListener("input", renderStats);
statsTeamFilter.addEventListener("change", renderStats);

statsEditToggle.addEventListener("click", () => {
  editingStats = !editingStats;
  statsEditToggle.setAttribute("aria-pressed", String(editingStats));
  statsEditToggle.textContent = editingStats ? "Done" : "Update stats";
  statsEditToggle.classList.toggle("is-active", editingStats);
  statsEditor.hidden = !editingStats;
});

statsSeasonInput.addEventListener("change", () => {
  const value = Number(statsSeasonInput.value);
  if (!statsCanSave || !isIntegerInRange(value, 2000, 2100)) {
    statsSeasonInput.value = String(ensureStats().season);
    return;
  }
  ensureStats().season = value;
  saveStats(`Stats season set to ${value}.`);
  renderStats();
});

// Which row a pasted row stands for: the team on the Team tab; otherwise the
// player (and team, to tell two players with the same name apart).
function rowIdentity(table, row) {
  const nameIndex = nameColumn(table);
  const teamIndex = teamColumn(table);
  const name = normalizePlayerName(row[nameIndex] || "");
  const team = teamIndex === -1 ? "" : (lookupTeamId(row[teamIndex] || "") || normalizePlayerName(row[teamIndex] || ""));
  if (category === "team" || nameIndex === teamIndex) return { name: lookupTeamId(row[nameIndex] || "") || name, team: "" };
  return { name, team };
}

// Update matching rows, add new ones, keep the rest. Columns are matched by
// header name; columns only in the new paste are added on the right.
function mergeStatTables(existing, incoming) {
  const key = (header) => normalizeHeader(header);
  const headers = [...existing.headers];
  for (const header of incoming.headers) {
    const count = (list) => list.filter((h) => key(h) === key(header)).length;
    // Keep duplicate header names (e.g. two "Yds" columns) as separate columns.
    if (count(headers) < count(incoming.headers.slice(0, incoming.headers.indexOf(header) + 1))) headers.push(header);
  }
  // Column position in the merged table for each column of each source table.
  const mapColumns = (source) => {
    const used = new Set();
    return source.headers.map((header) => {
      const index = headers.findIndex((h, i) => key(h) === key(header) && !used.has(i));
      used.add(index);
      return index;
    });
  };
  const fromExisting = mapColumns(existing);
  const fromIncoming = mapColumns(incoming);
  const reshape = (row, map) => {
    const out = headers.map(() => "");
    map.forEach((target, i) => { if (target !== -1) out[target] = row[i] ?? ""; });
    return out;
  };
  const table = { headers, rows: existing.rows.map((row) => reshape(row, fromExisting)) };
  const identities = table.rows.map((row) => rowIdentity(table, row));
  let updated = 0;
  let added = 0;
  const touched = new Set();
  for (const raw of incoming.rows) {
    const row = reshape(raw, fromIncoming);
    const id = rowIdentity(table, row);
    if (!id.name) continue;
    let matches = identities.map((other, index) => ({ other, index })).filter(({ other, index }) => other.name === id.name && !touched.has(index));
    if (matches.length > 1 && id.team) matches = matches.filter(({ other }) => other.team === id.team);
    if (matches.length >= 1) {
      const index = matches[0].index;
      // Keep values for columns this paste doesn't include.
      table.rows[index] = table.rows[index].map((value, i) => (fromIncoming.includes(i) ? row[i] : value));
      identities[index] = id;
      touched.add(index);
      updated += 1;
    } else {
      table.rows.push(row);
      identities.push(id);
      touched.add(table.rows.length - 1);
      added += 1;
    }
  }
  return { table, updated, added };
}

document.querySelector("#stats-paste-import").addEventListener("click", () => {
  if (!statsCanSave) return;
  const lines = document.querySelector("#stats-paste-input").value.replace(/^﻿/, "").split(/\r?\n/)
    .filter((line) => line.trim());
  // Header row: the first line with a Player/Name (or Team) column.
  const headerIndex = lines.findIndex((line) => line.split("\t").some((cell) =>
    /^(PLAYER|NAME|PLAYERNAME|FULLNAME|TEAM|TM)$/.test(normalizeHeader(cell))));
  if (headerIndex === -1 || lines.length - headerIndex < 2) {
    statsStatus.textContent = "Couldn't find a header row with a Player (or Team) column followed by data rows. Copy the table including its header row. No changes were made.";
    return;
  }
  const headers = lines[headerIndex].split("\t").map((cell) => cell.trim().slice(0, 40));
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  if (headers.length > 60) {
    statsStatus.textContent = "That table has more than 60 columns. No changes were made.";
    return;
  }
  const rows = lines.slice(headerIndex + 1)
    .map((line) => headers.map((_, index) => (line.split("\t")[index] || "").trim().slice(0, 80)))
    .filter((row) => row.some(Boolean))
    // Skip repeated header rows that some sites insert every few lines.
    .filter((row) => normalizeHeader(row.join("")) !== normalizeHeader(headers.join("")));
  if (rows.length > 5000) {
    statsStatus.textContent = "Paste 5,000 rows or fewer per category. No changes were made.";
    return;
  }
  const incoming = { headers: headers.map((header, index) => header || `Col ${index + 1}`), rows };
  const replaceAll = document.querySelector("#stats-replace-all").checked;
  const existing = officeData.stats?.tables?.[category] || null; // pasted table (box-score totals are built separately)
  let message;
  if (replaceAll || !existing || !existing.rows.length) {
    ensureStats().tables[category] = { ...incoming, updatedAt: new Date().toISOString() };
    message = `${statCategories[category]} stats ${replaceAll && existing ? "replaced" : "added"}: ${rows.length} ${rows.length === 1 ? "row" : "rows"}, ${headers.length} columns.`;
  } else {
    const merged = mergeStatTables(existing, incoming);
    if (merged.table.rows.length > 5000) {
      statsStatus.textContent = "That would put more than 5,000 rows in this category. No changes were made.";
      return;
    }
    ensureStats().tables[category] = { ...merged.table, updatedAt: new Date().toISOString() };
    message = `${statCategories[category]} stats updated: ${merged.updated} ${merged.updated === 1 ? "row" : "rows"} replaced, ${merged.added} added, ${merged.table.rows.length - merged.updated - merged.added} kept as they were.`;
  }
  document.querySelector("#stats-paste-input").value = "";
  document.querySelector("#stats-replace-all").checked = false;
  sortState = null;
  saveStats(message);
  renderStats();
});

const clearButton = document.querySelector("#stats-clear");
clearButton.addEventListener("click", () => {
  if (!statsCanSave || !currentTable()) return;
  if (!clearButton.classList.contains("is-armed")) {
    clearButton.classList.add("is-armed");
    clearButton.textContent = `Click again to clear ${statCategories[category]}`;
    setTimeout(() => {
      clearButton.classList.remove("is-armed");
      clearButton.textContent = "Clear this category";
    }, 4000);
    return;
  }
  clearButton.classList.remove("is-armed");
  clearButton.textContent = "Clear this category";
  delete ensureStats().tables[category];
  saveStats(`${statCategories[category]} stats cleared.`);
  renderStats();
});

// ---- Screenshot → table (Claude reads the image; available inside Claude only) ----
const shotPanel = document.querySelector("#stats-shot");
const shotInput = document.querySelector("#stats-shot-input");
const shotNote = document.querySelector("#stats-shot-note");
const shotStop = document.querySelector("#stats-shot-stop");
const pasteBox = document.querySelector("#stats-paste-input");
const shotDefaultNote = shotNote.textContent;
let sampleFn = null;
let imageLimits = null;
let shotController = null;

const shotErrors = {
  not_granted: "Claude wasn't allowed to read screenshots on this page. Paste the table as text instead.",
  sampling_disabled: "Reading screenshots isn't available for this account. Paste the table as text instead.",
  images_unavailable: "This view can't send screenshots to Claude. Paste the table as text instead.",
  image_rejected: "That image couldn't be read. Try a PNG or JPG screenshot under 20 MB.",
  rate_limited: "Too many requests just now. Wait a minute and try again.",
  session_expired: "Your Claude session expired. Sign in again, then retry.",
  refused: "Claude couldn't transcribe that image. Try a clearer screenshot of just the table.",
  invalid_json: "Claude's reading didn't come back as a table. Try again, or crop the screenshot to just the table.",
  empty_completion: "Nothing was read from that image. Try a clearer screenshot of just the table."
};

(async () => {
  try {
    sampleFn = await window.claude?.use?.("sample");
    if (!sampleFn) return;
    imageLimits = (await sampleFn.limits().catch(() => null))?.images || null;
    if (!imageLimits) return;
    shotInput.accept = imageLimits.mediaTypes.join(",");
    shotPanel.hidden = false;
  } catch {
    // No Claude on this copy of the page: the text paste still works.
  }
})();

function tableToTsv(headers, rows) {
  const clean = (value) => String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
  return [headers.map(clean).join("\t"), ...rows.map((row) => headers.map((_, i) => clean(row[i])).join("\t"))].join("\n");
}

async function readScreenshots(files) {
  if (!sampleFn || !imageLimits || !statsCanSave) return;
  const images = [...files].filter((file) => file.type.startsWith("image/")).slice(0, imageLimits.maxCount);
  if (!images.length) return;
  shotController?.abort();
  shotController = new AbortController();
  shotStop.hidden = false;
  shotPanel.classList.add("is-busy");
  shotNote.textContent = `Reading ${images.length === 1 ? "the screenshot" : `${images.length} screenshots`}… this can take up to a minute.`;
  const label = statCategories[category].toLowerCase();
  const prompt = [
    `The attached ${images.length === 1 ? "image is a screenshot" : "images are screenshots, in order,"} of a ${label} statistics table from an American football league (a simulation league that uses NFL teams).`,
    "Transcribe the table exactly. Rules:",
    "- headers: the column headers exactly as written (keep abbreviations such as Yds, TD, Int, Cmp%).",
    "- rows: one array per row, one string per column, in the same order as headers. Keep numbers exactly as shown, including commas, decimals, minus signs and percent signs.",
    category === "team"
      ? "- The first column should be the team name as shown."
      : "- Include the player's name in a column named Player. If the team is shown (as a name, abbreviation or logo you can identify), include it in a column named Team using the standard NFL abbreviation.",
    "- If several screenshots continue one table, combine them into a single table and do not repeat the header row or duplicate rows.",
    "- Skip totals, averages and rank-only columns that are not part of the data, and never invent values; use an empty string for a blank cell.",
    'Reply with only JSON: {"headers": ["Player", "Team", "Yds"], "rows": [["Name", "KC", "1,234"]]}'
  ].join("\n");
  try {
    const result = await sampleFn.json(prompt, { images, signal: shotController.signal });
    const headers = Array.isArray(result?.headers) ? result.headers.map(String).slice(0, 60) : [];
    const rows = Array.isArray(result?.rows) ? result.rows.filter(Array.isArray).slice(0, 5000) : [];
    if (!headers.length || !rows.length) throw { code: "invalid_json" };
    pasteBox.value = tableToTsv(headers, rows);
    shotNote.textContent = `Read ${rows.length} ${rows.length === 1 ? "row" : "rows"} and ${headers.length} columns. Check them in the box below (fix anything misread), then click Import stats.`;
    pasteBox.focus();
  } catch (error) {
    shotNote.textContent = error?.code === "cancelled" ? shotDefaultNote : (shotErrors[error?.code] || "Something went wrong reading the screenshot. Try again, or paste the table as text.");
    if (["not_granted", "sampling_disabled", "images_unavailable"].includes(error?.code)) {
      shotPanel.querySelector(".stats-shot-button").hidden = true;
    }
  } finally {
    shotStop.hidden = true;
    shotPanel.classList.remove("is-busy");
    shotInput.value = "";
  }
}

shotInput.addEventListener("change", () => readScreenshots(shotInput.files));
shotStop.addEventListener("click", () => shotController?.abort());
pasteBox.addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length || !sampleFn || !imageLimits) return;
  event.preventDefault();
  readScreenshots(files);
});
const importPanel = document.querySelector("#stats-import-panel");
importPanel.addEventListener("dragover", (event) => {
  if (!sampleFn || !imageLimits) return;
  event.preventDefault();
  importPanel.classList.add("is-dropping");
});
importPanel.addEventListener("dragleave", () => importPanel.classList.remove("is-dropping"));
importPanel.addEventListener("drop", (event) => {
  importPanel.classList.remove("is-dropping");
  const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length || !sampleFn || !imageLimits) return;
  event.preventDefault();
  readScreenshots(files);
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    renderStats();
  } catch {
    // keep showing the current stats
  }
});

renderStats();
