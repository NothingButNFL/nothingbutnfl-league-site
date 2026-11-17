// League History › Retired Players (retired.html): everyone marked retired on his profile (Player bio › Status), from
// the salary sheets and Player Contracts, with his league career from the Career Stats record book (career-core.js):
// career totals, then a season-by-season table per category. Uses league-core.js, stat-totals.js and career-core.js.
let rtData = emptyOfficeData();
try { rtData = readStoredOffice() || emptyOfficeData(); } catch { /* show nothing */ }
const rtList = document.querySelector("#retired-list");
const rtSearch = document.querySelector("#retired-search");
const rtSort = document.querySelector("#retired-sort");
const rtEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// The headline numbers shown on each card, per category.
const rtHeadline = {
  passing: ["yds", "td", "int", "rate"],
  rushing: ["att", "yds", "td", "avg"],
  receiving: ["rec", "yds", "td", "avg"],
  defense: ["tkl", "sacks", "int", "ff"],
  kicking: ["fgm", "fga", "fgpct", "pts"],
};

function rtRetired() {
  const out = [];
  for (const { id } of nflTeams) for (const player of rtData.teams[id].roster) if (isRetiredPlayer(player)) out.push({ player, team: id });
  for (const player of rtData.contractPlayers || []) if (isRetiredPlayer(player)) out.push({ player, team: player.team });
  return out.map((r) => {
    const career = careerForPlayer(rtData, r.player.name);
    const years = new Set(), teams = [];
    for (const { seasons } of Object.values(career)) for (const s of seasons) {
      years.add(s.year);
      if (s.team && !teams.includes(s.team)) teams.push(s.team);
    }
    if (r.team && r.team !== freeAgentTeamId && nflTeams.some(({ id }) => id === r.team) && !teams.includes(r.team)) teams.push(r.team);
    const profile = playerProfile(r.player);
    return { ...r, profile, career, years: [...years].sort(), teams };
  });
}

function rtCard(r) {
  const { player, profile, career, years, teams } = r;
  const card = rtEl("article", "management-panel retired-card");
  const head = rtEl("div", "retired-head");
  const photo = playerPortrait(player);
  photo.classList.add("retired-photo");
  if (!photo.querySelector("img")) photo.append(rtEl("b", "retired-initials", player.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()));
  const who = rtEl("div", "retired-who");
  const name = rtEl("h3");
  name.append(Object.assign(document.createElement("a"), { href: profileUrl(player.id), textContent: player.name }));
  const pos = profile.positions || player.position || (player.activeSeasons || []).map((y) => seasonEntry(player, y)?.position).find(Boolean) || "";
  const span = years.length ? `${years[0]}${years.length > 1 ? `–${years[years.length - 1]}` : ""} · ${years.length} season${years.length === 1 ? "" : "s"}` : "";
  who.append(name, rtEl("p", "retired-meta", [pos, profile.college, span].filter(Boolean).join(" · ")));
  const draft = profile.draftYear ? `Drafted ${profile.draftYear}${profile.draftRound ? `, round ${profile.draftRound}` : ""}${profile.draftPick ? `, pick ${profile.draftPick}` : ""}` : "";
  const teamLine = rtEl("p", "retired-teams");
  if (teams.length) {
    teamLine.append("Played for ");
    teams.forEach((t, i) => {
      if (i) teamLine.append(", ");
      if (nflTeams.some(({ id }) => id === t)) teamLine.append(Object.assign(document.createElement("a"), { href: `team.html?team=${encodeURIComponent(t)}`, textContent: teamName(t) }));
      else teamLine.append(t);
    });
  }
  if (draft) teamLine.append(teams.length ? ` · ${draft}` : draft);
  if (teamLine.childNodes.length) who.append(teamLine);
  const badge = rtEl("div", "retired-badge");
  badge.append(rtEl("span", "", "RETIRED"), rtEl("strong", "", String(profile.retiredYear || "")));
  head.append(photo, who, badge);
  card.append(head);

  const cats = Object.keys(crCats).filter((c) => career[c]);
  if (!cats.length) {
    card.append(rtEl("p", "retired-none", "No league stats on record. Stats come from Season Stats and the Career Stats record book."));
    return card;
  }
  // Career totals: the headline numbers of each category he played in.
  const totals = rtEl("div", "retired-totals");
  for (const c of cats) {
    const box = rtEl("div", "retired-total");
    box.append(rtEl("span", "retired-total-cat", crCats[c].toUpperCase()));
    const nums = rtEl("div", "retired-total-nums");
    for (const key of rtHeadline[c]) {
      const col = crSpec[c].find((x) => x.key === key);
      const value = crFormat(col, career[c].totals[key]);
      if (!value) continue;
      const n = rtEl("span", "retired-num");
      n.append(rtEl("strong", "", value), rtEl("small", "", col.label));
      nums.append(n);
    }
    box.append(nums);
    totals.append(box);
  }
  card.append(totals);
  // Season by season, one table per category.
  const more = rtEl("details", "retired-seasons");
  more.append(rtEl("summary", "", "Season by season"));
  for (const c of cats) {
    const spec = crSpec[c];
    const wrap = rtEl("div", "stats-table-wrap retired-table-wrap");
    const table = rtEl("table", "stats-table retired-table");
    const cap = rtEl("caption", "", crCats[c]);
    const thead = table.createTHead().insertRow();
    for (const label of ["Season", "Team", ...spec.map((x) => x.label)]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      if (label !== "Team") th.className = "is-number";
      thead.append(th);
    }
    const body = table.createTBody();
    for (const s of career[c].seasons) {
      const tr = body.insertRow();
      tr.insertCell().textContent = s.year;
      tr.insertCell().textContent = s.team;
      for (const col of spec) { const td = tr.insertCell(); td.textContent = crFormat(col, s.t[col.key]); td.className = "is-number"; }
      tr.cells[0].className = "is-number";
    }
    const foot = table.createTFoot().insertRow();
    foot.insertCell().textContent = "Career";
    foot.insertCell().textContent = `${career[c].seasons.length} season${career[c].seasons.length === 1 ? "" : "s"}`;
    for (const col of spec) { const td = foot.insertCell(); td.textContent = crFormat(col, career[c].totals[col.key]); td.className = "is-number"; }
    table.prepend(cap);
    wrap.append(table);
    more.append(wrap);
  }
  card.append(more);
  return card;
}

function rtRender() {
  const all = rtRetired();
  const q = rtSearch.value.trim().toLowerCase();
  let list = all.filter((r) => !q || [r.player.name, r.profile.positions, r.profile.college, ...r.teams, ...r.teams.map((t) => (nflTeams.some(({ id }) => id === t) ? teamName(t) : ""))].join(" ").toLowerCase().includes(q));
  const by = rtSort.value;
  list.sort((a, b) => (by === "name" ? a.player.name.localeCompare(b.player.name)
    : by === "seasons" ? b.years.length - a.years.length || a.player.name.localeCompare(b.player.name)
    : (b.profile.retiredYear || 0) - (a.profile.retiredYear || 0) || a.player.name.localeCompare(b.player.name)));
  rtList.replaceChildren(...list.map(rtCard));
  document.querySelector("#retired-count").textContent = String(all.length);
  const empty = document.querySelector("#retired-empty");
  empty.hidden = list.length > 0;
  empty.textContent = all.length ? "No retired players match." : "No retired players yet. Mark a player retired on his profile: Player bio › Status › Retired.";
}

rtSearch.addEventListener("input", rtRender);
rtSort.addEventListener("change", rtRender);
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { rtData = readStoredOffice() || rtData; rtRender(); } catch { /* keep the view */ }
});
rtRender();
