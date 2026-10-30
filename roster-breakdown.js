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
  const count = groupKeys.reduce((t, k) => t + groups[k].count, 0);
  sub.textContent = `${count} players · ${formatCurrency(total)} in cap hits`;
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

function renderLeague() {
  const measure = rbMeasure.value;
  const data = nflTeams.map(({ id }) => ({ id, ...breakdown(id) }));
  const shownKeys = groupKeys.filter((k) => k !== "OTHER" || data.some((d) => d.groups.OTHER.count));
  const max = Object.fromEntries(shownKeys.map((k) => [k, Math.max(1, ...data.map((d) => measure === "count" ? d.groups[k].count : measure === "share" ? (d.total ? d.groups[k].cap / d.total : 0) : d.groups[k].cap))]));
  document.querySelector("#rb-head").replaceChildren(...["TEAM", ...shownKeys, "TOTAL"].map((label) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label === "OTHER" ? "OTHER" : label;
    if (label !== "TEAM" && label !== "TOTAL") th.title = groupLabel(label);
    return th;
  }));
  document.querySelector("#rb-rows").replaceChildren(...data.map((d) => {
    const tr = document.createElement("tr");
    tr.className = d.id === rbTeamSelect.value ? "is-selected" : "";
    const teamCell = tr.insertCell();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rb-team-button";
    button.dataset.team = d.id;
    const code = document.createElement("b");
    code.textContent = d.id;
    button.append(code, teamName(d.id));
    teamCell.append(button);
    for (const key of shownKeys) {
      const g = d.groups[key];
      const td = tr.insertCell();
      const value = measure === "count" ? g.count : measure === "share" ? (d.total ? g.cap / d.total : 0) : g.cap;
      td.textContent = cellText(g, d.total, measure);
      td.style.setProperty("--heat", String(Math.min(1, value / max[key])));
      td.className = "rb-heat";
      td.title = `${teamName(d.id)} ${groupLabel(key)}: ${g.count} players, ${formatCurrency(g.cap)}`;
    }
    const total = tr.insertCell();
    total.className = "rb-total";
    total.textContent = measure === "count" ? String(groupKeys.reduce((t, k) => t + d.groups[k].count, 0)) : measure === "share" ? "100%" : short(d.total);
    return tr;
  }));
}

function renderAll() {
  renderSeasonTabs();
  renderTeamDetail();
  renderLeague();
}

rbTeamSelect.append(new Option("Choose a team", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
rbTeamSelect.addEventListener("change", renderAll);
rbMeasure.addEventListener("change", renderLeague);
document.querySelector("#rb-seasons").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-year]");
  if (!tab) return;
  rbSeason = Number(tab.dataset.year);
  renderAll();
});
document.querySelector("#rb-rows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-team]");
  if (!button) return;
  rbTeamSelect.value = button.dataset.team;
  renderAll();
  document.querySelector("#rb-team-detail").scrollIntoView({ behavior: "smooth", block: "start" });
});
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData(); renderAll(); } catch { /* keep the last good data */ }
});
renderAll();
