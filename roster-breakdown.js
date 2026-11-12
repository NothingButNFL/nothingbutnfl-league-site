// Roster Breakdown: cap spend and head count by position group, per team and league-wide, from the salary sheets.
let officeData = emptyOfficeData();
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch {
  // unreadable saved data: show empty sheets
}

let rbSeason = seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
const rbTeamSelect = document.querySelector("#rb-team");
const rbMeasure = document.querySelector("#rb-measure");
const groupKeys = [...rosterPositionGroups.map(([key]) => key), "OTHER"];
const groupLabel = (key) => (rosterPositionGroups.find(([k]) => k === key) || [key, "Other / not set"])[1];

function breakdown(teamId) {
  const groups = Object.fromEntries(groupKeys.map((key) => [key, { count: 0, cap: 0, players: [] }]));
  let total = 0;
  for (const player of officeData.teams[teamId].roster) {
    if (!isPlayerOnSeason(player, rbSeason)) continue;
    const entry = seasonEntry(player, rbSeason);
    const key = positionGroupFor(entry.position);
    const cap = capHitFor(entry);
    groups[key].count += 1;
    groups[key].cap += cap;
    groups[key].players.push({ player, entry, cap });
    total += cap;
  }
  return { groups, total };
}

const short = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v > 0 ? `$${Math.round(v / 1e3)}K` : "$0");
function cellText(group, total, measure) {
  if (measure === "count") return String(group.count);
  if (measure === "share") return total ? `${((group.cap / total) * 100).toFixed(0)}%` : "—";
  return group.count ? short(group.cap) : "—";
}

function renderSeasonTabs() {
  document.querySelector("#rb-seasons").replaceChildren(...seasons.map((year) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `tab-button${year === rbSeason ? " is-active" : ""}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(year === rbSeason));
    tab.dataset.year = String(year);
    tab.textContent = String(year);
    return tab;
  }));
}

function renderTeamDetail() {
  const wrap = document.querySelector("#rb-team-detail");
  const teamId = rbTeamSelect.value;
  if (!teamId) { wrap.replaceChildren(); wrap.hidden = true; return; }
  wrap.hidden = false;
  const { groups, total } = breakdown(teamId);
  const title = document.createElement("div");
  title.className = "rb-team-head";
  const h = document.createElement("h3");
  h.textContent = `${teamName(teamId)} · ${rbSeason}`;
  const sub = document.createElement("p");
  const counts = rosterCounts(teamId, rbSeason, officeData);
  sub.textContent = `${counts.active} active · ${counts.practiceSquad} practice squad · ${formatCurrency(total)} in cap hits`;
  const link = document.createElement("a");
  link.className = "workspace-button";
  link.href = `team.html?team=${encodeURIComponent(teamId)}`;
  link.textContent = "Open salary sheet ↗";
  title.append(h, sub, link);
  // Stacked share bar
  const bar = document.createElement("div");
  bar.className = "rb-stack";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", groupKeys.filter((k) => groups[k].cap).map((k) => `${groupLabel(k)} ${total ? Math.round((groups[k].cap / total) * 100) : 0}%`).join(", "));
  for (const key of groupKeys) {
    if (!groups[key].cap || !total) continue;
    const seg = document.createElement("span");
    seg.className = `rb-seg rb-${key.toLowerCase()}`;
    seg.style.width = `${(groups[key].cap / total) * 100}%`;
    seg.title = `${groupLabel(key)}: ${formatCurrency(groups[key].cap)}`;
    if (groups[key].cap / total > 0.07) seg.textContent = key;
    bar.append(seg);
  }
  const cards = document.createElement("div");
  cards.className = "rb-groups";
  for (const key of groupKeys) {
    const g = groups[key];
    if (key === "OTHER" && !g.count) continue;
    const card = document.createElement("article");
    card.className = `rb-group rb-${key.toLowerCase()}`;
    const head = document.createElement("header");
    const name = document.createElement("strong");
    name.textContent = groupLabel(key);
    const amount = document.createElement("span");
    amount.textContent = `${g.count} · ${formatCurrency(g.cap)}${total && g.cap ? ` · ${((g.cap / total) * 100).toFixed(1)}%` : ""}`;
    head.append(name, amount);
    const list = document.createElement("ol");
    for (const { player, entry, cap } of g.players.sort((a, b) => b.cap - a.cap)) {
      const li = document.createElement("li");
      const who = document.createElement("a");
      who.href = profileUrl(player.id);
      who.textContent = player.name;
      const pos = document.createElement("small");
      pos.textContent = entry.position || "";
      if (isPracticeSquad(entry)) {
        const tag = document.createElement("abbr");
        tag.className = "rb-ps-tag";
        tag.textContent = isPsElevated(entry) ? "PS ↑" : "PS";
        tag.title = isPsElevated(entry) ? "Practice squad, elevated for game day" : "Practice squad";
        pos.append(" ", tag);
      }
      const hit = document.createElement("span");
      hit.textContent = formatCurrency(cap);
      li.append(who, pos, hit);
      list.append(li);
    }
    if (!g.players.length) {
      const li = document.createElement("li");
      li.className = "rb-none";
      li.textContent = "No players";
      list.append(li);
    }
    card.append(head, list);
    cards.append(card);
  }
  wrap.replaceChildren(title, bar, cards);
}

// ---- Active Roster Breakdown: main-roster head count by position, against the league's requirements ----
const rbcColumns = [
  ["QB", ["QB"], 2], ["RB", ["RB", "HB"], 3], ["FB", ["FB"], 0], ["TE", ["TE"], 3], ["WR", ["WR"], 5],
  ["OT/IOL", ["OL", "OT", "T", "LT", "RT", "OG", "G", "LG", "RG", "C", "IOL"], 9],
  ["DL/EDGE", ["DL", "DE", "DT", "NT", "EDGE", "ED", "IDL", "LE", "RE", "LEDG", "REDG", "OLB"], 8], // OLBs are edge rushers here
  ["LB", ["LB", "ILB", "MLB", "WLB", "SLB", "MIKE", "WILL", "SAM"], 4],
  ["CB/S", ["DB", "CB", "S", "FS", "SS", "NB", "SAF"], 8],
  ["LS", ["LS"], 1], ["K", ["K", "PK"], 1], ["P", ["P"], 1],
];
const rbcMain = 53; // main roster size
const rbcPs = "16+1"; // practice squad: 16, plus 1 international exemption
function rosterCountsByColumn(teamId) {
  const counts = Object.fromEntries(rbcColumns.map(([label]) => [label, 0]));
  const caps = Object.fromEntries(rbcColumns.map(([label]) => [label, 0]));
  let main = 0, ps = 0, other = 0, cel = 0, mainCap = 0, psCap = 0, celCap = 0;
  for (const player of officeData.teams[teamId].roster) {
    if (!isPlayerOnSeason(player, rbSeason)) continue;
    const entry = seasonEntry(player, rbSeason);
    const cap = capHitFor(entry);
    if (isPracticeSquad(entry)) { ps += 1; psCap += cap; continue; }
    if (isOnCel(entry)) { cel += 1; celCap += cap; continue; } // on the Commissioner's Exempt List: not on the main roster
    main += 1;
    mainCap += cap;
    const first = String(entry.position || "").toUpperCase().split(/[\s/,-]+/).find(Boolean) || "";
    const col = rbcColumns.find(([, list]) => list.includes(first));
    if (col) { counts[col[0]] += 1; caps[col[0]] += cap; } else other += 1;
  }
  return { counts, caps, main, ps, other, cel, mainCap, psCap, celCap, totalCap: mainCap + psCap + celCap };
}
// Show: Player count (default, checked against the requirements), Cap dollars, or Share of payroll (of the team's
// total cap hits, practice squad and CEL included). Cap views shade each column darker where a team spends more.
function renderCounts() {
  const measure = rbMeasure.value;
  const isCount = measure === "count";
  const th = (text, cls = "") => { const e = document.createElement("th"); e.scope = "col"; e.textContent = text; if (cls) e.className = cls; return e; };
  document.querySelector("#rbc-head").replaceChildren(th("TEAM", "rbc-team"), th("ABV"), ...rbcColumns.map(([label]) => th(label)), th("MAIN", "rbc-main-h"), th("PS"), th("CEL"));
  const cell = (tr, text, cls = "") => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const data = nflTeams.map(({ id }) => ({ id, ...rosterCountsByColumn(id) }));
  const value = (d, cap) => (measure === "share" ? (d.totalCap ? cap / d.totalCap : 0) : cap);
  const show = (d, cap) => (measure === "share" ? (d.totalCap ? `${((cap / d.totalCap) * 100).toFixed(1)}%` : "—") : cap ? short(cap) : "—");
  const keys = [...rbcColumns.map(([label]) => label), "MAIN", "PS", "CEL"];
  const capOf = (d, key) => (key === "MAIN" ? d.mainCap : key === "PS" ? d.psCap : key === "CEL" ? d.celCap : d.caps[key]);
  const max = Object.fromEntries(keys.map((k) => [k, Math.max(1e-9, ...data.map((d) => value(d, capOf(d, k))))]));
  const req = document.createElement("tr");
  req.className = "rbc-req";
  cell(req, isCount ? "Requirements" : measure === "share" ? "Share of payroll" : "Cap dollars", "rbc-team"); cell(req, "");
  if (isCount) {
    rbcColumns.forEach(([, , min]) => cell(req, String(min)));
    cell(req, String(rbcMain)); cell(req, rbcPs); cell(req, String(celLimit));
  } else keys.forEach(() => cell(req, ""));
  const rows = data.map((d) => {
    const { id, counts, main, ps, other, cel } = d;
    const tr = document.createElement("tr");
    if (id === rbTeamSelect.value) tr.className = "is-selected";
    const name = tr.insertCell();
    name.className = "rbc-team";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rb-team-button";
    button.dataset.team = id;
    button.textContent = teamName(id);
    name.append(button);
    cell(tr, id, "rbc-abv");
    if (!isCount) {
      for (const key of keys) {
        const cap = capOf(d, key);
        const n = key === "MAIN" ? main : key === "PS" ? ps : key === "CEL" ? cel : counts[key];
        const td = cell(tr, show(d, cap), `rb-heat${key === "MAIN" ? " rbc-main-cap" : ""}`);
        td.style.setProperty("--heat", String(Math.min(1, value(d, cap) / max[key])));
        td.title = `${teamName(id)} ${key}: ${n} player${n === 1 ? "" : "s"}, ${formatCurrency(cap)}${d.totalCap ? ` (${((cap / d.totalCap) * 100).toFixed(1)}% of payroll)` : ""}`;
      }
      return tr;
    }
    for (const [label, , min] of rbcColumns) {
      const td = cell(tr, String(counts[label]), counts[label] < min ? "rbc-short" : "");
      td.title = counts[label] < min ? `${teamName(id)}: ${counts[label]} ${label}, needs ${min}` : `${teamName(id)}: ${counts[label]} ${label}`;
    }
    const m = cell(tr, String(main), `rbc-main ${main === rbcMain ? "is-ok" : main > rbcMain ? "is-over" : "is-under"}`);
    m.title = `${main} on the main roster${other ? ` (${other} with no position or one not in these columns)` : ""}`;
    cell(tr, String(ps), `rbc-ps ${ps <= 17 ? "is-ok" : "is-over"}`);
    const c = cell(tr, String(cel), `rbc-cel${cel >= celLimit ? " is-full" : ""}`);
    c.title = `${cel} of ${celLimit} Commissioner's Exempt List spots used`;
    return tr;
  });
  document.querySelector("#rbc-rows").replaceChildren(...(isCount ? [req] : []), ...rows); // the Requirements row is for counts only
}
document.querySelector("#rbc-rows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-team]");
  if (!button) return;
  rbTeamSelect.value = button.dataset.team;
  renderAll();
  document.querySelector("#rb-team-detail").scrollIntoView({ behavior: "smooth", block: "start" });
});

function renderAll() {
  renderSeasonTabs();
  renderTeamDetail();
  renderCounts();
}

rbTeamSelect.append(new Option("Choose a team", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
rbTeamSelect.addEventListener("change", renderAll);
rbMeasure.addEventListener("change", renderCounts);
document.querySelector("#rb-seasons").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-year]");
  if (!tab) return;
  rbSeason = Number(tab.dataset.year);
  renderAll();
});
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData(); renderAll(); } catch { /* keep the last good data */ }
});
renderAll();
