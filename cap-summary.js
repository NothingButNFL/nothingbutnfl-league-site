// Cap Summary: every team's cap figures for one season, from the salary sheets (league-core seasonCapFigures).
let officeData = emptyOfficeData();
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch {
  // unreadable saved data: show empty sheets
}

let csSeason = seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
let csSort = { key: "remaining", direction: -1 };

const csColumns = [
  ["team", "TEAM"], ["players", "PLAYERS"], ["baseCap", "BASE CAP"], ["rollover", "ROLLOVER"], ["adjustment", "ADJUSTMENT"],
  ["totalCap", "TOTAL CAP"], ["payroll", "PAYROLL"], ["deadCap", "DEAD CAP"], ["remaining", "CAP ROOM"], ["used", "% USED"]
];

function teamRows() {
  return nflTeams.map(({ id }) => {
    const figures = seasonCapFigures(id, csSeason, officeData);
    const team = officeData.teams[id];
    const players = team.roster.filter((p) => isPlayerOnSeason(p, csSeason)).length;
    const used = figures.totalCap ? (figures.payroll + figures.deadCap) / figures.totalCap : null;
    return { id, players, adjustment: team.seasons[csSeason].manualAdjustment, used, ...figures };
  });
}

function money(value, signed = false) {
  if (value === null || value === undefined) return "—";
  if (signed) return formatSignedCurrency(value).replace("-", "−");
  return value < 0 ? `−${formatCurrency(Math.abs(value))}` : formatCurrency(value);
}

function renderSummary() {
  // Season tabs
  document.querySelector("#cs-seasons").replaceChildren(...seasons.map((year) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `tab-button${year === csSeason ? " is-active" : ""}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(year === csSeason));
    tab.dataset.year = String(year);
    tab.textContent = String(year);
    return tab;
  }));
  const rows = teamRows();
  const sorted = [...rows].sort((a, b) => {
    const k = csSort.key;
    if (k === "team") return csSort.direction * teamName(a.id).localeCompare(teamName(b.id));
    const av = a[k] ?? -Infinity, bv = b[k] ?? -Infinity;
    return csSort.direction * (av - bv) || teamName(a.id).localeCompare(teamName(b.id));
  });
  // Header
  document.querySelector("#cs-head").replaceChildren(...csColumns.map(([key, label]) => {
    const th = document.createElement("th");
    th.scope = "col";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cs-sort";
    button.dataset.key = key;
    button.textContent = label + (csSort.key === key ? (csSort.direction === 1 ? " ↑" : " ↓") : "");
    th.setAttribute("aria-sort", csSort.key === key ? (csSort.direction === 1 ? "ascending" : "descending") : "none");
    th.append(button);
    return th;
  }));
  // Body
  document.querySelector("#cs-rows").replaceChildren(...sorted.map((row) => {
    const tr = document.createElement("tr");
    const teamCell = tr.insertCell();
    const link = document.createElement("a");
    link.className = "cs-team";
    link.href = `team.html?team=${encodeURIComponent(row.id)}`;
    const code = document.createElement("b");
    code.textContent = row.id;
    link.append(code, teamName(row.id));
    teamCell.append(link);
    tr.insertCell().textContent = String(row.players);
    tr.insertCell().textContent = money(row.baseCap);
    tr.insertCell().textContent = money(row.rollover);
    tr.insertCell().textContent = row.adjustment ? money(row.adjustment, true) : "—";
    tr.insertCell().textContent = money(row.totalCap);
    tr.insertCell().textContent = money(row.payroll);
    tr.insertCell().textContent = row.deadCap ? money(row.deadCap) : "—";
    const room = tr.insertCell();
    room.className = `cs-room${row.remaining === null ? "" : row.remaining < 0 ? " is-negative" : row.remaining > 0 ? " is-positive" : ""}`;
    room.textContent = row.remaining === null ? "Set base cap" : money(row.remaining);
    const used = tr.insertCell();
    used.className = "cs-used";
    if (row.used === null) used.textContent = "—";
    else {
      const bar = document.createElement("span");
      bar.className = `cs-bar${row.used > 1 ? " is-over" : ""}`;
      const fill = document.createElement("i");
      fill.style.width = `${Math.min(100, Math.max(0, row.used * 100))}%`;
      bar.append(fill);
      const pct = document.createElement("span");
      pct.textContent = `${(row.used * 100).toFixed(1)}%`;
      used.append(bar, pct);
    }
    return tr;
  }));
  // League totals
  const known = rows.filter((r) => r.remaining !== null);
  const sum = (key) => rows.reduce((t, r) => t + (r[key] || 0), 0);
  const over = known.filter((r) => r.remaining < 0).length;
  const cards = [
    ["League payroll", money(sum("payroll"))],
    ["Dead cap", money(sum("deadCap"))],
    ["Total cap room", known.length ? money(known.reduce((t, r) => t + r.remaining, 0)) : "Set base cap"],
    ["Teams over the cap", known.length ? String(over) : "—"],
    ["Most room", known.length ? (() => { const r = [...known].sort((a, b) => b.remaining - a.remaining)[0]; return `${r.id} ${money(r.remaining)}`; })() : "—"]
  ];
  document.querySelector("#cs-totals").replaceChildren(...cards.map(([label, value]) => {
    const card = document.createElement("article");
    card.className = "cap-stat";
    const l = document.createElement("span");
    l.textContent = label.toUpperCase();
    const v = document.createElement("strong");
    v.textContent = value;
    if (label === "Teams over the cap" && over > 0) v.className = "is-negative";
    card.append(l, v);
    return card;
  }));
  document.querySelector("#cs-note").textContent = officeData.leagueCaps[csSeason] === null
    ? `The ${csSeason} base cap isn't set, so cap room can't be worked out yet. Set it on Admin → League Cap Directory.`
    : `Rollover is each team's unused cap room from the season before. Payroll is the sum of ${csSeason} cap hits on each salary sheet.`;
}

document.querySelector("#cs-seasons").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-year]");
  if (!tab) return;
  csSeason = Number(tab.dataset.year);
  renderSummary();
});
document.querySelector("#cs-head").addEventListener("click", (event) => {
  const button = event.target.closest("[data-key]");
  if (!button) return;
  const key = button.dataset.key;
  csSort = csSort.key === key ? { key, direction: -csSort.direction } : { key, direction: key === "team" ? 1 : -1 };
  renderSummary();
});
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData(); renderSummary(); } catch { /* keep showing the last good data */ }
});
renderSummary();
