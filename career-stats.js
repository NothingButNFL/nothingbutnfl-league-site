// League History › Career Stats (career-stats.html): every player's stats added up across all seasons in the record
// book, with all-time leaders. The record book is data.careerSeasons = { [season]: { tables: { passing, rushing,
// receiving, defense, kicking } } }, each table { headers, rows } like Season Stats. The season in progress counts
// straight from Season Stats (box-score totals or pasted tables, via stat-totals.js) and is copied into the record
// book whenever this page is opened, so it's kept after Season Stats is cleared for a new season.
// Uses league-core.js and stat-totals.js.
const crTabs = document.querySelector("#career-tabs");
const crTable = document.querySelector("#career-table");
const crLeaders = document.querySelector("#career-leaders");
const crStatus = document.querySelector("#career-status");
const crEmpty = document.querySelector("#career-empty");
const crSearch = document.querySelector("#career-search");
const crActive = document.querySelector("#career-active");
let crData = emptyOfficeData();
let crCanSave = true;
try { crData = readStoredOffice() || emptyOfficeData(); } catch { crCanSave = false; }
let crCategory = "passing";
let crSort = null; // { key, dir }

function crSnapshot() {
  if (!crCanSave) return;
  const live = crLiveTables(crData);
  if (!Object.keys(live).length) return;
  const year = String(crLiveSeason(crData));
  const saved = crData.careerSeasons?.[year]?.tables || {};
  const merged = { ...saved, ...live };
  if (JSON.stringify(merged) === JSON.stringify(saved)) return;
  crData.careerSeasons = { ...(crData.careerSeasons || {}), [year]: { tables: merged } };
  try { writeStoredOffice(crData); } catch { /* shown live anyway */ }
}

const crActiveCheck = () => {
  const names = new Set();
  // On a roster or in Player Contracts, and not marked retired on his profile.
  for (const { id } of nflTeams) for (const p of crData.teams[id].roster) if (!p.profile?.retired) names.add(normalizePlayerName(p.name));
  for (const p of crData.contractPlayers || []) if (!p.profile?.retired) names.add(normalizePlayerName(p.name));
  return (key) => names.has(key);
};
const crFound = (p) => (typeof findPlayerByName === "function" ? findPlayerByName(crData, p.name, p.teams[p.teams.length - 1]) : null);
function crPlayerCell(p) {
  const found = crFound(p);
  if (!found) return document.createTextNode(p.name);
  const link = Object.assign(document.createElement("a"), { href: profileUrl(found.player.id), textContent: p.name, className: "career-player-link" });
  if (!found.player.profile?.retired) return link;
  const wrap = document.createDocumentFragment();
  wrap.append(link, Object.assign(document.createElement("span"), { className: "career-ret", textContent: "RET", title: `Retired${found.player.profile.retiredYear ? ` in ${found.player.profile.retiredYear}` : ""}` }));
  return wrap;
}

// ---------- Drawing ----------
function crRenderTabs() {
  const seasons = crSeasons(crData);
  crTabs.replaceChildren(...Object.entries(crCats).map(([key, label]) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `tab-button${key === crCategory ? " is-active" : ""}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(key === crCategory));
    tab.textContent = label;
    if (!Object.values(seasons).some((s) => s[key]?.rows?.length)) tab.classList.add("is-empty");
    tab.addEventListener("click", () => { crCategory = key; crSort = null; crRender(); });
    return tab;
  }));
}

function crRender() {
  crRenderTabs();
  const seasons = crSeasons(crData);
  const years = Object.keys(seasons).filter((y) => Object.values(seasons[y]).some((t) => t?.rows?.length)).sort();
  document.querySelector("#career-subtitle").textContent = years.length
    ? `All-time leaders, added up across ${years.length} season${years.length === 1 ? "" : "s"} (${years[0]}${years.length > 1 ? `–${years[years.length - 1]}` : ""}). The ${crLiveSeason(crData)} season counts as it's played.`
    : "All-time leaders, added up across every season in the record book.";
  document.querySelector("#career-cat-input").value ||= crCategory;
  const spec = crSpec[crCategory];
  let list = crTotals(crData, crCategory);
  const all = list;
  // Leader cards: top 10 all-time for the headline stats.
  crLeaders.replaceChildren(...spec.filter((c) => c.lead).map((c) => {
    const ranked = all.filter((p) => (p.t[c.key] ?? 0) > 0).sort((a, b) => b.t[c.key] - a.t[c.key]).slice(0, 10);
    const card = document.createElement("article");
    card.className = "stats-leader-card career-leader-card";
    const ol = document.createElement("ol");
    for (const p of ranked) {
      const li = document.createElement("li");
      const who = document.createElement("span");
      who.className = "stats-leader-name";
      who.append(crPlayerCell(p));
      if (p.teams.length) who.append(Object.assign(document.createElement("small"), { textContent: p.teams.join(", ") }));
      li.append(who, Object.assign(document.createElement("strong"), { textContent: crFormat(c, p.t[c.key]) }));
      ol.append(li);
    }
    card.append(Object.assign(document.createElement("h3"), { textContent: c.lead }), Object.assign(document.createElement("span"), { className: "stats-leader-column", textContent: "CAREER" }), ol);
    if (!ranked.length) card.append(Object.assign(document.createElement("p"), { className: "leader-empty", textContent: "No stats yet." }));
    return card;
  }));
  // Table
  const q = crSearch.value.trim().toLowerCase();
  const active = crActive.checked ? crActiveCheck() : null;
  list = list.filter((p) => (!q || `${p.name} ${p.teams.join(" ")} ${p.teams.map((t) => (nflTeams.some(({ id }) => id === t) ? teamName(t) : "")).join(" ")}`.toLowerCase().includes(q)) && (!active || active(p.key)));
  const sort = crSort || { key: crDefaultSort[crCategory], dir: -1 };
  const val = (p) => (sort.key === "name" ? p.name : sort.key === "seasons" ? p.seasons.size : p.t[sort.key] ?? -Infinity);
  list.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * sort.dir || a.name.localeCompare(b.name); });
  const cols = [{ key: "rank", label: "#" }, { key: "name", label: "Player" }, { key: "teams", label: "Team" }, { key: "seasons", label: "Seasons" }, ...spec];
  const thead = document.createElement("thead");
  const hr = thead.insertRow();
  for (const c of cols) {
    const th = document.createElement("th");
    th.scope = "col";
    if (c.key === "rank" || c.key === "teams") th.textContent = c.label;
    else {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "contracts-sort", textContent: c.label + (sort.key === c.key ? (sort.dir < 0 ? " ▼" : " ▲") : "") });
      b.addEventListener("click", () => { crSort = { key: c.key, dir: sort.key === c.key ? -sort.dir : c.key === "name" ? 1 : -1 }; crRender(); });
      th.append(b);
      th.setAttribute("aria-sort", sort.key === c.key ? (sort.dir < 0 ? "descending" : "ascending") : "none");
      if (c.key !== "name") th.className = "is-number";
    }
    hr.append(th);
  }
  const tbody = document.createElement("tbody");
  list.slice(0, 1000).forEach((p, i) => {
    const tr = tbody.insertRow();
    tr.insertCell().textContent = String(i + 1);
    const name = tr.insertCell();
    name.className = "stats-name career-name";
    name.append(crPlayerCell(p));
    const teams = tr.insertCell();
    const lastTeam = p.teams[p.teams.length - 1] || "";
    if (nflTeams.some(({ id }) => id === lastTeam)) teams.append(Object.assign(document.createElement("a"), { href: `team.html?team=${encodeURIComponent(lastTeam)}`, textContent: lastTeam }));
    else teams.textContent = lastTeam;
    if (p.teams.length > 1) teams.title = `Played for ${p.teams.join(", ")}`;
    const yrs = tr.insertCell();
    yrs.textContent = String(p.seasons.size);
    yrs.className = "is-number";
    yrs.title = [...p.seasons].sort().join(", ");
    for (const c of spec) {
      const td = tr.insertCell();
      td.textContent = crFormat(c, p.t[c.key]);
      td.className = `is-number${sort.key === c.key ? " is-sorted" : ""}`;
    }
  });
  crTable.replaceChildren(thead, tbody);
  document.querySelector("#career-count").textContent = list.length.toLocaleString("en-US");
  crEmpty.hidden = list.length > 0;
  crEmpty.textContent = !all.length
    ? `No ${crCats[crCategory].toLowerCase()} stats yet. They come from Season Stats as the season is played; add past seasons with Manage seasons.`
    : "No players match.";
  document.querySelector("#career-note").textContent = years.length ? `${years.length} season${years.length === 1 ? "" : "s"} in the record book` : "";
  crRenderSeasons();
}

// ---------- Managing seasons ----------
function crRenderSeasons() {
  const box = document.querySelector("#career-seasons");
  const saved = crData.careerSeasons || {};
  const years = Object.keys(saved).sort().reverse();
  if (!years.length) { box.replaceChildren(Object.assign(document.createElement("p"), { className: "hs-help", textContent: "No seasons saved yet." })); return; }
  box.replaceChildren(...years.map((year) => {
    const row = document.createElement("div");
    row.className = "career-season-row";
    const cats = Object.entries(saved[year].tables || {}).filter(([, t]) => t?.rows?.length).map(([k, t]) => `${crCats[k] || k} (${t.rows.length})`);
    row.append(Object.assign(document.createElement("strong"), { textContent: year }),
      Object.assign(document.createElement("span"), { textContent: `${cats.join(" · ") || "empty"}${String(crLiveSeason(crData)) === year ? " · season in progress, kept up to date from Season Stats" : ""}` }));
    const rm = Object.assign(document.createElement("button"), { type: "button", className: "workspace-button", textContent: "Remove" });
    rm.disabled = !crCanSave;
    rm.addEventListener("click", async () => {
      const live = String(crLiveSeason(crData)) === year;
      if (!(await confirmAction(`Remove the ${year} season from the record book?${live ? " It's the season in progress, so its Season Stats still count until they're cleared." : ""}`, { confirmLabel: "Remove season", danger: true }))) return;
      const next = { ...(crData.careerSeasons || {}) };
      delete next[year];
      if (Object.keys(next).length) crData.careerSeasons = next; else delete crData.careerSeasons;
      crSave(`${year} removed from the record book.`);
    });
    row.append(rm);
    return row;
  }));
}
function crSave(message) {
  try { writeStoredOffice(crData); crStatus.textContent = message; }
  catch (error) { crStatus.textContent = /quota/i.test(`${error.name} ${error.message}`) ? "Browser storage is full, so that wasn't saved." : `Couldn't save: ${error.message}.`; try { crData = readStoredOffice() || crData; } catch { /* keep */ } }
  crRender();
}

const crCatInput = document.querySelector("#career-cat-input");
crCatInput.replaceChildren(...Object.entries(crCats).map(([k, v]) => new Option(v, k)));
document.querySelector("#career-season-input").value = String(crLiveSeason(crData) - 1);
document.querySelector("#career-paste-save").addEventListener("click", () => {
  if (!crCanSave) return;
  const year = Number(document.querySelector("#career-season-input").value);
  if (!Number.isInteger(year) || year < 1920 || year > 2100) { crStatus.textContent = "Enter the season (e.g. 2024)."; return; }
  const cat = crCatInput.value;
  const lines = document.querySelector("#career-paste").value.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => (line.includes("\t") ? line.split("\t") : line.split(","));
  const headerAt = lines.findIndex((line) => split(line).some((cell) => /^(PLAYER|NAME|PLAYERNAME|FULLNAME)$/.test(statHeaderKey(cell))));
  if (headerAt === -1 || lines.length - headerAt < 2) { crStatus.textContent = "Couldn't find a header row with a Player column followed by rows. Copy the table including its header row. Nothing was changed."; return; }
  const headers = split(lines[headerAt]).map((c) => c.trim().slice(0, 40));
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  if (headers.length > 60) { crStatus.textContent = "That table has more than 60 columns. Nothing was changed."; return; }
  const rows = lines.slice(headerAt + 1).map((line) => headers.map((_, i) => (split(line)[i] || "").trim().slice(0, 80)))
    .filter((row) => row.some(Boolean) && statHeaderKey(row.join("")) !== statHeaderKey(headers.join("")));
  if (!rows.length || rows.length > 5000) { crStatus.textContent = "Paste between 1 and 5,000 rows. Nothing was changed."; return; }
  const table = { headers: headers.map((h, i) => h || `Col ${i + 1}`), rows };
  const matched = crSpec[cat].filter((c) => c.re && statColumn(table, c.re) !== -1).map((c) => c.label);
  const all = { ...(crData.careerSeasons || {}) };
  const had = Boolean(all[year]?.tables?.[cat]);
  all[year] = { tables: { ...(all[year]?.tables || {}), [cat]: table } };
  crData.careerSeasons = all;
  document.querySelector("#career-paste").value = "";
  crCategory = cat;
  crSave(`${had ? "Replaced" : "Added"} ${year} ${crCats[cat].toLowerCase()}: ${rows.length} player${rows.length === 1 ? "" : "s"}. Counted columns: ${matched.join(", ") || "none matched; check the headers"}.`);
});

const crEditBtn = document.querySelector("#career-edit");
crEditBtn.hidden = !crCanSave;
crEditBtn.addEventListener("click", () => {
  const editor = document.querySelector("#career-editor");
  editor.hidden = !editor.hidden;
  crEditBtn.setAttribute("aria-pressed", String(!editor.hidden));
  crEditBtn.textContent = editor.hidden ? "Manage seasons" : "Done";
});
crSearch.addEventListener("input", crRender);
crActive.addEventListener("change", crRender);
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { crData = readStoredOffice() || crData; crRender(); } catch { /* keep the view */ }
});

crSnapshot();
crRender();
