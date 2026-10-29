// ---- Standings (league, conference, division) ----
// Records live in officeData.standings (league-core.js) and are entered with "Edit records".
const standingsPanel = document.querySelector("#standings-panel");
const standingsFootnote = document.querySelector("#standings-footnote");
const standingsStatus = document.querySelector("#standings-status");
const standingsEditor = document.querySelector("#standings-editor");
const editToggle = document.querySelector("#standings-edit");
const seasonInput = document.querySelector("#standings-season-input");

let officeData = emptyOfficeData();
let standingsCanSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch {
  standingsCanSave = false;
  editToggle.hidden = true;
}
let standingsView = "league";
let editing = false;

function ensureStandings() {
  if (!officeData.standings) officeData.standings = { season: currentLeagueYear(), teams: {} };
  return officeData.standings;
}

function saveStandings(message) {
  try {
    writeStoredOffice(officeData);
    standingsStatus.textContent = message;
  } catch (error) {
    standingsStatus.textContent = `Could not save: ${error.message}.`;
  }
}

const formatPct = (record) => winPct(record).toFixed(3).replace(/^0/, "");
const formatDiff = (record) => {
  const diff = record.pf - record.pa;
  return diff > 0 ? `+${diff}` : String(diff);
};

function teamCell(teamId, extra = "") {
  const wrap = document.createElement("span");
  wrap.className = "standing-team";
  const logo = document.createElement("span");
  logo.className = "team-monogram standings-logo";
  const image = document.createElement("img");
  image.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${nflTeams.find(({ id }) => id === teamId).logo}.png`;
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", () => { image.remove(); logo.textContent = teamId; }, { once: true });
  logo.append(image);
  const link = document.createElement("a");
  link.href = `team.html?team=${encodeURIComponent(teamId)}`;
  link.textContent = teamName(teamId);
  wrap.append(logo, link);
  if (extra) {
    const tag = document.createElement("small");
    tag.className = "standings-tag";
    tag.textContent = extra;
    wrap.append(tag);
  }
  return wrap;
}

function rankedTeams(teamIds) {
  return teamIds.map((teamId) => ({ teamId, record: teamRecord(officeData, teamId) })).sort(compareRecords);
}

// Columns: [key, label, render]. Edit mode turns record cells into inputs.
const statColumns = [
  ["w", "W"], ["l", "L"], ["t", "T"], ["pct", "PCT"], ["pf", "PF"], ["pa", "PA"], ["diff", "DIFF"], ["streak", "STRK"]
];

function statCell(row, key, record, teamId) {
  const td = row.insertCell();
  const editable = editing && ["w", "l", "t", "pf", "pa", "streak"].includes(key);
  if (editable) {
    const input = document.createElement("input");
    input.dataset.team = teamId;
    input.dataset.field = key;
    input.setAttribute("aria-label", `${teamName(teamId)} ${key.toUpperCase()}`);
    if (key === "streak") {
      input.type = "text";
      input.maxLength = 8;
      input.placeholder = "W1";
      input.value = record.streak || "";
    } else {
      input.type = "number";
      input.min = "0";
      input.max = key === "pf" || key === "pa" ? "2000" : "30";
      input.step = "1";
      input.value = String(record[key]);
    }
    td.append(input);
    return;
  }
  td.textContent = key === "pct" ? formatPct(record) : key === "diff" ? formatDiff(record) : key === "streak" ? (record.streak || "—") : String(record[key]);
  if (key === "diff") td.className = record.pf - record.pa > 0 ? "is-up" : record.pf - record.pa < 0 ? "is-down" : "";
}

function buildTable(rows, { caption, firstLabel = "#", rankText, extraColumn, rowClass } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "standings-table-wrap";
  if (caption) {
    const heading = document.createElement("h3");
    heading.className = "standings-group-title";
    heading.textContent = caption;
    wrap.append(heading);
  }
  const table = document.createElement("table");
  table.className = "standings-table";
  const head = table.createTHead().insertRow();
  for (const label of [firstLabel, "TEAM", ...(extraColumn ? [extraColumn.label] : []), ...statColumns.map(([, l]) => l)]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.append(th);
  }
  const body = table.createTBody();
  rows.forEach((entry, index) => {
    const row = body.insertRow();
    if (rowClass) row.className = rowClass(entry, index);
    row.insertCell().textContent = rankText ? rankText(entry, index) : String(index + 1).padStart(2, "0");
    row.insertCell().append(teamCell(entry.teamId, entry.tag));
    if (extraColumn) row.insertCell().textContent = extraColumn.value(entry);
    for (const [key] of statColumns) statCell(row, key, entry.record, entry.teamId);
  });
  wrap.append(table);
  return wrap;
}

// Simplified seeding: division winners 1–4, then the three best other records.
function conferenceSeeds(conference) {
  const divisions = nflDivisions.filter((division) => division.conference === conference);
  const winners = divisions.map((division) => rankedTeams(division.teams)[0]).sort(compareRecords);
  const winnerIds = new Set(winners.map(({ teamId }) => teamId));
  const others = rankedTeams(divisions.flatMap((division) => division.teams)).filter(({ teamId }) => !winnerIds.has(teamId));
  return [
    ...winners.map((entry, index) => ({ ...entry, seed: index + 1, tag: "DIV" })),
    ...others.map((entry, index) => ({ ...entry, seed: index < 3 ? index + 5 : null, tag: index < 3 ? "WC" : "" }))
  ];
}

const divisionOrder = ["East", "North", "South", "West"];

// Compact W-L-T board like a printed standings sheet: one table per division,
// AFC divisions stacked on the left, NFC on the right.
function divisionBoard() {
  const board = document.createElement("div");
  board.className = "division-board";
  for (const conference of ["AFC", "NFC"]) {
    const column = document.createElement("div");
    column.className = "division-board-column";
    column.setAttribute("aria-label", `${conference} divisions`);
    for (const direction of divisionOrder) {
      const division = nflDivisions.find(({ name }) => name === `${conference} ${direction}`);
      const table = document.createElement("table");
      table.className = "division-board-table";
      const head = table.createTHead().insertRow();
      const title = document.createElement("th");
      title.scope = "col";
      title.textContent = division.name;
      head.append(title);
      for (const label of ["W", "L", "T"]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        head.append(th);
      }
      const body = table.createTBody();
      for (const entry of rankedTeams(division.teams)) {
        const row = body.insertRow();
        row.insertCell().append(teamCell(entry.teamId));
        for (const key of ["w", "l", "t"]) statCell(row, key, entry.record, entry.teamId);
      }
      column.append(table);
    }
    board.append(column);
  }
  return board;
}

function renderStandingsView() {
  const standings = ensureStandings();
  document.querySelector("#standings-season")?.replaceChildren(String(standings.season));
  seasonInput.value = String(standings.season);
  standingsPanel.replaceChildren();
  standingsPanel.dataset.view = standingsView;

  if (standingsView === "league") {
    const rows = rankedTeams(nflTeams.map(({ id }) => id));
    standingsPanel.append(buildTable(rows));
    // Every division, AFC on the left and NFC on the right (East, North, South, West).
    const boardHeading = document.createElement("h3");
    boardHeading.className = "standings-section-title";
    boardHeading.textContent = "Division Standings";
    standingsPanel.append(boardHeading, divisionBoard());
    standingsFootnote.innerHTML = "<span>All 32 teams ranked by record, then every division.</span><span>Click a team for its salary sheet</span>";
  } else if (standingsView === "conference") {
    const grid = document.createElement("div");
    grid.className = "standings-grid standings-grid-2";
    for (const conference of ["AFC", "NFC"]) {
      grid.append(buildTable(conferenceSeeds(conference), {
        caption: conference === "AFC" ? "American Football Conference" : "National Football Conference",
        firstLabel: "SEED",
        rankText: (entry) => (entry.seed ? String(entry.seed) : "—"),
        rowClass: (entry) => (entry.seed === 7 ? "is-cutline" : entry.seed ? "is-playoff" : "")
      }));
    }
    standingsPanel.append(grid);
    standingsFootnote.innerHTML = '<span><i class="legend-dot"></i> Seeds 1–4: division winners (DIV) · 5–7: wild cards (WC)</span><span>Simplified tiebreakers: win %, wins, point differential</span>';
  } else {
    // Same AFC-left / NFC-right layout, with every stat column.
    const grid = document.createElement("div");
    grid.className = "standings-grid standings-grid-2";
    for (const conference of ["AFC", "NFC"]) {
      const column = document.createElement("div");
      column.className = "standings-conference-column";
      for (const direction of divisionOrder) {
        const division = nflDivisions.find(({ name }) => name === `${conference} ${direction}`);
        column.append(buildTable(rankedTeams(division.teams), {
          caption: division.name,
          rowClass: (entry, index) => (index === 0 ? "is-leader" : "")
        }));
      }
      grid.append(column);
    }
    standingsPanel.append(grid);
    standingsFootnote.innerHTML = '<span><i class="legend-dot"></i> Division leader highlighted</span><span>Simplified tiebreakers: win %, wins, point differential</span>';
  }

  document.querySelectorAll(".standings-section .tab-button").forEach((tab) => {
    const active = tab.dataset.view === standingsView;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  standingsPanel.setAttribute("aria-labelledby", `tab-${standingsView}`);
}

document.querySelectorAll(".standings-section .tab-button").forEach((tab) => {
  tab.addEventListener("click", () => {
    standingsView = tab.dataset.view;
    renderStandingsView();
  });
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const views = ["league", "conference", "division"];
    standingsView = views[(views.indexOf(standingsView) + (event.key === "ArrowRight" ? 1 : 2)) % 3];
    renderStandingsView();
    document.querySelector(`#tab-${standingsView}`).focus();
  });
});

editToggle.addEventListener("click", () => {
  editing = !editing;
  editToggle.setAttribute("aria-pressed", String(editing));
  editToggle.textContent = editing ? "Done editing" : "Edit records";
  editToggle.classList.toggle("is-active", editing);
  standingsEditor.hidden = !editing;
  renderStandingsView();
});

standingsPanel.addEventListener("change", (event) => {
  const input = event.target.closest("input[data-team]");
  if (!input || !standingsCanSave) return;
  const { team, field } = input.dataset;
  const standings = ensureStandings();
  const record = { ...teamRecord(officeData, team) };
  if (field === "streak") {
    record.streak = input.value.trim().toUpperCase().slice(0, 8);
  } else {
    const max = field === "pf" || field === "pa" ? 2000 : 30;
    const value = Number(input.value);
    if (!isIntegerInRange(value, 0, max)) {
      input.value = String(record[field]);
      standingsStatus.textContent = `Enter a whole number from 0 to ${max}.`;
      return;
    }
    record[field] = value;
  }
  standings.teams[team] = record;
  saveStandings(`${teamName(team)}: ${record.w}-${record.l}${record.t ? `-${record.t}` : ""}.`);
  // Re-sort after the edit, keeping focus near where the user was.
  const keep = `[data-team="${team}"][data-field="${field}"]`;
  renderStandingsView();
  standingsPanel.querySelector(keep)?.focus();
});

seasonInput.addEventListener("change", () => {
  const value = Number(seasonInput.value);
  if (!isIntegerInRange(value, 2000, 2100) || !standingsCanSave) {
    seasonInput.value = String(ensureStandings().season);
    return;
  }
  ensureStandings().season = value;
  saveStandings(`Standings season set to ${value}.`);
  renderStandingsView();
});

const resetButton = document.querySelector("#standings-reset");
resetButton.addEventListener("click", () => {
  if (!standingsCanSave) return;
  if (!resetButton.classList.contains("is-armed")) {
    resetButton.classList.add("is-armed");
    resetButton.textContent = "Click again to reset all 32 records";
    setTimeout(() => {
      resetButton.classList.remove("is-armed");
      resetButton.textContent = "Reset every record to 0-0";
    }, 4000);
    return;
  }
  resetButton.classList.remove("is-armed");
  resetButton.textContent = "Reset every record to 0-0";
  ensureStandings().teams = {};
  saveStandings("Every record reset to 0-0.");
  renderStandingsView();
});

function standingsTeamFromText(text) {
  const value = text.trim().toLowerCase().replace(/^[xyz*]+-\s*/, "");
  if (!value) return null;
  return lookupTeamId(value);
}

document.querySelector("#standings-paste-import").addEventListener("click", () => {
  if (!standingsCanSave) return;
  const lines = document.querySelector("#standings-paste-input").value.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  const fieldFor = (header) => {
    const h = header.toLowerCase().replace(/[^a-z]/g, "");
    return { team: "team", tm: "team", club: "team", franchise: "team", w: "w", wins: "w", l: "l", losses: "l", t: "t", ties: "t",
      pf: "pf", pointsfor: "pf", pts: "pf", pa: "pa", pointsagainst: "pa", strk: "streak", streak: "streak",
      record: "record", wlt: "record", wl: "record" }[h] || null;
  };
  const headerIndex = lines.findIndex((line) => line.split("\t").map(fieldFor).includes("team"));
  if (headerIndex === -1) {
    standingsStatus.textContent = "Couldn't find a header row with a Team column. Include your header row when you copy. No changes were made.";
    return;
  }
  const columns = new Map();
  lines[headerIndex].split("\t").forEach((cell, index) => {
    const field = fieldFor(cell);
    if (field && !columns.has(field)) columns.set(field, index);
  });
  const standings = ensureStandings();
  let updated = 0;
  const problems = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = lines[index].split("\t");
    const cell = (field) => (columns.has(field) ? (cells[columns.get(field)] ?? "").trim() : undefined);
    const teamId = standingsTeamFromText(cell("team") || "");
    if (!teamId) {
      if (cell("team")) problems.push(`team "${cell("team")}"`);
      continue;
    }
    const record = { ...teamRecord(officeData, teamId) };
    let bad = false;
    const recordText = cell("record");
    if (recordText) {
      const match = recordText.match(/^(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?$/);
      if (match) Object.assign(record, { w: Number(match[1]), l: Number(match[2]), t: Number(match[3] || 0) });
      else bad = true;
    }
    for (const [field, max] of [["w", 30], ["l", 30], ["t", 30], ["pf", 2000], ["pa", 2000]]) {
      const text = cell(field);
      if (text === undefined || text === "") continue;
      const value = Number(text);
      if (!isIntegerInRange(value, 0, max)) bad = true;
      else record[field] = value;
    }
    if (cell("streak") !== undefined) record.streak = cell("streak").toUpperCase().slice(0, 8);
    if (bad) {
      problems.push(`${teamId} (a number wasn't valid)`);
      continue;
    }
    standings.teams[teamId] = record;
    updated += 1;
  }
  const message = `Updated ${updated} ${updated === 1 ? "team" : "teams"}.` +
    (problems.length ? ` Skipped: ${problems.slice(0, 10).join(", ")}${problems.length > 10 ? ", …" : ""}.` : "");
  if (updated) {
    document.querySelector("#standings-paste-input").value = "";
    document.querySelector("#standings-import-panel").open = false;
    saveStandings(message);
  } else {
    standingsStatus.textContent = message;
  }
  renderStandingsView();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    renderStandingsView();
  } catch {
    // keep showing the current standings
  }
});

renderStandingsView();
