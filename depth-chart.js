// Team sheet "Depth Chart" tab. Uses officeData / activeTeamId / saveOfficeData from front-office.js.
// Saved in officeData.depthCharts[teamId] (league-core.js validDepthCharts).
const depthPanel = document.querySelector("#depth-chart-panel");

// League rules: which positions may play each depth-chart slot, best fit first. Nobody else is offered for that slot.
const posQB = ["QB"], posRB = ["RB", "HB"], posFB = ["FB"], posWR = ["WR"], posTE = ["TE"];
const posOT = ["LT", "RT", "OT", "T"], posIOL = ["LG", "RG", "OG", "G", "C", "IOL"], posOL = [...posOT, ...posIOL, "OL"];
const posDT = ["DT", "NT", "IDL", "DL"], posEdge = ["LEDG", "REDG", "EDGE", "DE", "LE", "RE", "ED", "DL"];
const posOLB = ["SAM", "WILL", "OLB", "SLB", "WLB", "LOLB", "ROLB"], posILB = ["MIKE", "MLB", "ILB"], posLB = [...posILB, ...posOLB, "LB"];
const posCB = ["CB", "NB"], posS = ["FS", "SS", "S", "SAF"], posDB = [...posCB, ...posS, "DB"];
const posK = ["K", "PK"], posP = ["P"];
const posSkill = [...posRB, ...posFB, ...posWR, ...posTE, ...posQB, ...posDB]; // ball-handling / return positions
const uniq = (list) => [...new Set(list)];
const depthFits = {
  QB: uniq([...posQB, ...posK, ...posP]), HB: uniq([...posRB, ...posFB]), FB: uniq([...posFB, ...posRB, ...posTE]),
  WR: uniq([...posWR, ...posRB, ...posTE]), TE: posTE,
  LT: uniq([...posOT, ...posOL]), RT: uniq([...posOT, ...posOL]), LG: uniq([...posIOL, ...posOL]), RG: uniq([...posIOL, ...posOL]), C: uniq(["C", ...posIOL, ...posOL]),
  DT: uniq([...posDT, ...posEdge]), LE: uniq([...posEdge, ...posDT, ...posOLB]), RE: uniq([...posEdge, ...posDT, ...posOLB]),
  SAM: uniq([...posOLB, ...posLB, ...posEdge]), WILL: uniq([...posOLB, ...posLB, ...posEdge]), MIKE: uniq([...posILB, ...posLB]),
  CB: uniq([...posCB, ...posDB]), FS: uniq(["FS", ...posS, ...posDB]), SS: uniq(["SS", ...posS, ...posDB]),
  K: uniq([...posK, ...posP]), P: uniq([...posP, ...posK]), KOS: uniq([...posK, ...posP, ...posSkill]),
  PR: uniq([...posWR, ...posRB, ...posCB, ...posSkill]), KR: uniq([...posWR, ...posRB, ...posCB, ...posSkill]).filter((p) => p !== "SS"),
  LS: uniq(["LS", ...posTE, ...posIOL]),
  NT: uniq(["NT", ...posDT]), SUBLB: uniq([...posLB, "SS"]), SLCB: uniq([...posCB, ...posDB]),
  RRE: uniq([...posEdge, ...posOLB]), RLE: uniq([...posEdge, ...posOLB]), RDT: uniq([...posDT, ...posEdge]),
  PWHB: uniq([...posRB, ...posFB]), "3DRB": uniq([...posRB, ...posFB]), GAD: posSkill, SLWR: uniq([...posWR, ...posTE, ...posRB])
};
// The league's Madden scheme lists.
const offenseSchemes = ["Multiple Power Run", "Multiple Zone Run", "Vertical Zone Run", "Vertical Power Run", "Spread", "Run And Shoot", "Air Raid", "Pistol", "West Coast Spread", "West Coast Zone Run", "West Coast Power Run"];
const defenseSchemes = ["3-4 Under", "Tampa 2", "4-3 Quarters", "Disguise 3-4", "3-4 Storm", "4-3 Cover 3", "46 Defense", "Base 4-3", "4-3 Under", "Base 3-4"];

function depthChartFor(teamId) {
  if (!officeData.depthCharts) officeData.depthCharts = {};
  if (!officeData.depthCharts[teamId]) officeData.depthCharts[teamId] = { slots: {}, schemes: {} };
  const chart = officeData.depthCharts[teamId];
  chart.slots = chart.slots || {};
  chart.schemes = chart.schemes || {};
  return chart;
}

// Practice squad players stay off the depth chart unless they're elevated for game day.
function depthRoster() {
  const year = currentLeagueYear();
  return selectedTeamData().roster
    .filter((p) => !p.activeSeasons.length || p.activeSeasons.some((season) => season >= year))
    .filter((p) => { const entry = p.seasons[year]; return !isPracticeSquad(entry) || isPsElevated(entry); })
    .map((p) => {
      const season = p.seasons[year] || p.seasons[p.activeSeasons[0]] || {};
      return { id: p.id, name: p.name, position: String(playerDisplayPosition(p, year) || "").toUpperCase(), cap: season.baseSalary !== undefined ? capHitFor(season) : 0 };
    });
}

// Best rank among the player's listed positions ("CB / S" counts as either); 99 = not allowed in this slot.
const fitRank = (slot, position) => {
  const fits = depthFits[slot] || [];
  const ranks = String(position || "").toUpperCase().split(/[\s/,-]+/).filter(Boolean).map((p) => fits.indexOf(p)).filter((r) => r >= 0);
  return ranks.length ? Math.min(...ranks) : 99;
};

// League overall right now, cached per render (null when he has no starting overall yet).
let dcOverallCache = new Map();
function dcOverall(id) {
  if (!dcOverallCache.has(id)) {
    const season = seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
    dcOverallCache.set(id, typeof ratingCurrent === "function" ? ratingCurrent(officeData, season, id) : null);
  }
  return dcOverallCache.get(id);
}

// ---- Lineup view: the depth chart laid out like Madden's Lineup screen ----
// A card per starter, placed in formation, with that spot's backups listed under it. A slot with several starters
// (DT in a 4-3, MIKE in a 3-4, CB, WR) splits its depth: card 1 gets spots 1, k+1, 2k+1…, card 2 gets 2, k+2… (k = cards).
// The defense's front follows the team's Defensive Scheme: 3-4 schemes show three DTs with the edges at linebacker.
let dcTab = "offense";
const dcTabs = [["offense", "Offense"], ["defense", "Defense"], ["special", "Special Teams"], ["specialist", "Specialist"]];
const isThreeFour = (scheme) => /3-4/.test(scheme || "");
// [label, slot, card #, cards for this slot, column, row] on a 16-column grid (each card spans 2 columns), laid out
// like Madden's Lineup screens. headers: [text, column, row, span] group titles (Specialist tab).
function dcFormation(tab, chart) {
  if (tab === "offense") return { cols: 16, cards: [
    ["LT", "LT", 0, 1, 3, 1], ["LG", "LG", 0, 1, 5, 1], ["C", "C", 0, 1, 7, 1], ["RG", "RG", 0, 1, 9, 1], ["RT", "RT", 0, 1, 11, 1], ["TE", "TE", 0, 1, 13, 1],
    ["WR1", "WR", 0, 2, 1, 2], ["HB", "HB", 0, 1, 5, 2], ["QB", "QB", 0, 1, 7, 2], ["FB", "FB", 0, 1, 9, 2], ["WR2", "WR", 1, 2, 14, 2]] };
  if (tab === "defense") return isThreeFour(chart.schemes.defense)
    ? { cols: 16, cards: [
      // Madden's 3-4: the edges stand up at linebacker (REDG, LEDG) beside MIKE and WILL; three DTs on the line.
      ["FS", "FS", 0, 1, 2, 1], ["REDG", "RE", 0, 1, 5, 1], ["MIKE", "MIKE", 0, 1, 7, 1], ["WILL", "WILL", 0, 1, 9, 1], ["LEDG", "LE", 0, 1, 11, 1], ["SS", "SS", 0, 1, 14, 1],
      ["CB1", "CB", 0, 2, 1, 2], ["DT3", "DT", 2, 3, 6, 2], ["DT1", "DT", 0, 3, 8, 2], ["DT2", "DT", 1, 3, 10, 2], ["CB2", "CB", 1, 2, 15, 2]] }
    : { cols: 16, cards: [
      ["FS", "FS", 0, 1, 2, 1], ["WILL", "WILL", 0, 1, 6, 1], ["MIKE", "MIKE", 0, 1, 8, 1], ["SAM", "SAM", 0, 1, 10, 1], ["SS", "SS", 0, 1, 14, 1],
      ["CB1", "CB", 0, 2, 1, 2], ["REDG", "RE", 0, 1, 5, 2], ["DT1", "DT", 0, 2, 7, 2], ["DT2", "DT", 1, 2, 9, 2], ["LEDG", "LE", 0, 1, 11, 2], ["CB2", "CB", 1, 2, 15, 2]] };
  if (tab === "special") return { cols: 16, cards: [
    ["P", "P", 0, 1, 4, 1], ["K", "K", 0, 1, 6, 1], ["LS", "LS", 0, 1, 9, 1, "is-dropped"], ["KR", "KR", 0, 1, 11, 1, "is-dropped"],
    ["KOS", "KOS", 0, 1, 4, 2], ["PR", "PR", 0, 1, 6, 2]] };
  return { cols: 16, headers: [["Nickel & Dime Defenses", 4, 1, 6], ["Offensive Specialist", 4, 3, 6]], cards: [
    ["NT", "NT", 0, 1, 2, 2], ["SUBLB", "SUBLB", 0, 1, 4, 2], ["SLCB", "SLCB", 0, 1, 6, 2], ["RRE", "RRE", 0, 1, 8, 2], ["RLE", "RLE", 0, 1, 10, 2], ["RDT", "RDT", 0, 1, 12, 2],
    ["PWHB", "PWHB", 0, 1, 4, 4], ["3DRB", "3DRB", 0, 1, 6, 4], ["GAD", "GAD", 0, 1, 8, 4], ["SLWR", "SLWR", 0, 1, 10, 4]] };
}

// Starting spots on the Offense and Defense tabs (the first spot on each card), as "SLOT:index" → card label.
// The defense's starters depend on the scheme (a 3-4 starts three DTs, a 4-3 starts SAM).
function dcStarterSpots(chart) {
  const spots = new Map();
  for (const tab of ["offense", "defense"]) for (const [label, slot, card] of dcFormation(tab, chart).cards) spots.set(`${slot}:${card}`, label);
  return spots;
}
// Who starts where on offense/defense: playerId → card label (a player may start at only one of these).
function dcStartersById(chart) {
  const byId = new Map();
  for (const [key, label] of dcStarterSpots(chart)) {
    const [slot, index] = key.split(":");
    const id = (chart.slots[slot] || [])[Number(index)];
    if (id && !byId.has(id)) byId.set(id, label);
  }
  return byId;
}

function dcPhoto(id) {
  const found = id ? findPlayerById(officeData, id) : null;
  const src = found ? profilePhotoSrc(playerProfile(found.player)) : "";
  const box = document.createElement("div");
  box.className = "dc-photo";
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    box.append(img);
  } else if (found) {
    box.append(Object.assign(document.createElement("span"), { className: "dc-initials", textContent: found.player.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("") }));
  }
  return box;
}
const dcTier = (ovr) => (ovr === null ? "is-none" : ovr >= 90 ? "is-elite" : ovr >= 80 ? "is-good" : ovr >= 70 ? "is-mid" : "is-low");

function formationView(chart, roster) {
  const wrap = document.createElement("div");
  wrap.className = "dc-lineup";
  const tabs = document.createElement("div");
  tabs.className = "dc-tabs";
  tabs.setAttribute("role", "tablist");
  for (const [id, label] of dcTabs) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dc-tab";
    b.dataset.dcTab = id;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(dcTab === id));
    b.textContent = label;
    tabs.append(b);
  }
  wrap.append(tabs);
  if (dcTab === "defense") {
    const note = document.createElement("p");
    note.className = "dc-scheme-note";
    note.textContent = chart.schemes.defense
      ? `${chart.schemes.defense}: ${isThreeFour(chart.schemes.defense) ? "3-4 front (DT1-DT3 on the line; REDG, MIKE, WILL, LEDG at linebacker)" : "4-3 front (4 down linemen, 3 linebackers)"}.`
      : "No Defensive Scheme chosen yet, so this shows a 4-3 front. Pick the scheme on the right.";
    wrap.append(note);
  }
  const { cols, cards, headers = [] } = dcFormation(dcTab, chart);
  const startingAt = dcStartersById(chart);
  const starterSpots = dcStarterSpots(chart);
  const field = document.createElement("div");
  field.className = `dc-field dc-field-${dcTab}`;
  field.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  for (const [text, col, row, span] of headers) {
    const h = document.createElement("h5");
    h.className = "dc-group";
    h.textContent = text;
    h.style.gridColumn = `${col} / span ${span}`;
    h.style.gridRow = String(row);
    field.append(h);
  }
  for (const [label, slot, card, count, col, row, extra = ""] of cards) {
    const size = depthSlotSizes[slot];
    const ids = chart.slots[slot] || [];
    const spots = [];
    for (let i = card; i < size; i += count) spots.push(i);
    const starter = ids[spots[0]] || "";
    const ovr = starter ? dcOverall(starter) : null;
    const el = document.createElement("div");
    el.className = `dc-card ${dcTier(ovr)} ${extra}`.trim();
    el.style.gridColumn = `${col} / span 2`;
    el.style.gridRow = String(row);
    const top = document.createElement("div");
    top.className = "dc-card-top";
    top.append(dcPhoto(starter));
    if (ovr !== null) top.append(Object.assign(document.createElement("span"), { className: "dc-ovr", textContent: String(ovr), title: "League overall" }));
    el.append(top);
    spots.forEach((index, n) => {
      const line = document.createElement("label");
      line.className = n === 0 ? "dc-line is-starter" : "dc-line";
      // A starting spot on Offense/Defense can't take someone already starting at another position there.
      const taken = starterSpots.has(`${slot}:${index}`) ? new Map([...startingAt].filter(([id]) => id !== ids[index])) : null;
      const select = slotSelect(slot, index, ids[index], roster, true, taken);
      select.setAttribute("aria-label", `${label} ${n === 0 ? "starter" : `backup ${n}`}`);
      // The card shows just "J.ALLEN"; the (invisible) dropdown on top of it lists everyone with position and overall.
      const chosen = ids[index] ? findPlayerById(officeData, ids[index]) : null;
      const shown = document.createElement("span");
      shown.className = `dc-name${chosen ? "" : " is-empty"}${select.classList.contains("is-stale") ? " is-stale" : ""}`;
      shown.textContent = chosen ? dcShortName(chosen.player.name) : ids[index] ? "Removed player" : "—";
      line.append(shown, select);
      const r = ids[index] ? dcOverall(ids[index]) : null;
      if (n > 0 && r !== null) line.append(Object.assign(document.createElement("span"), { className: "dc-line-ovr", textContent: String(r) }));
      el.append(line);
    });
    const tag = document.createElement("span");
    tag.className = "dc-pos";
    tag.textContent = label;
    tag.title = { "3DRB": "Third-down back", GAD: "Gadget", PWHB: "Power back", SLWR: "Slot receiver", RLE: "Rush left end", RRE: "Rush right end", RDT: "Rush defensive tackle", NT: "Nose tackle", SUBLB: "Sub linebacker", SLCB: "Slot corner", KOS: "Kickoff specialist", ROLB: "SAM linebacker", LOLB: "WILL linebacker", MLB: "MIKE linebacker", MLB1: "MIKE linebacker", MLB2: "MIKE linebacker (2nd)", REDG: "Right edge (RE)", LEDG: "Left edge (LE)" }[label] || slot;
    el.append(tag);
    field.append(el);
  }
  wrap.append(field);
  return wrap;
}

// "Josh Allen" → "J.Allen" (Madden lineup style; "Jr."/"III" kept).
const dcShortName = (name) => { const parts = String(name).trim().split(/\s+/); return parts.length < 2 ? name : `${parts[0][0]}.${parts.slice(1).join(" ")}`; };

function slotSelect(slot, index, chosen, roster, short = false, taken = null) {
  const select = document.createElement("select");
  select.className = "depth-select";
  select.dataset.slot = slot;
  select.dataset.index = String(index);
  select.setAttribute("aria-label", `${slot} ${index + 1}`);
  select.append(new Option("—", ""));
  // Each name shows his league overall (Player Ratings: Madden changes count only once the team has updated him).
  const ovr = (id) => dcOverall(id);
  const fits = roster.filter((p) => fitRank(slot, p.position) < 99).sort((a, b) => fitRank(slot, a.position) - fitRank(slot, b.position) || (ovr(b.id) ?? -1) - (ovr(a.id) ?? -1) || b.cap - a.cap || a.name.localeCompare(b.name));
  const label = (p) => `${short ? dcShortName(p.name) : p.name}${p.position ? ` (${p.position})` : ""}${ovr(p.id) !== null ? ` · ${ovr(p.id)}` : ""}`;
  // Only positions the league allows here (see depthFits).
  select.append(...fits.map((p) => {
    const option = new Option(label(p), p.id);
    if (taken?.has(p.id)) { option.disabled = true; option.textContent += ` — starts at ${taken.get(p.id)}`; }
    return option;
  }));
  const saved = chosen && roster.find((p) => p.id === chosen);
  if (saved && fitRank(slot, saved.position) === 99) {
    // Saved before the position rules (or his position changed): kept, but flagged.
    select.append(new Option(`${label(saved)} — not allowed at ${slot}`, saved.id));
    select.classList.add("is-stale");
  }
  if (chosen && !roster.some((p) => p.id === chosen)) {
    const found = findPlayerById(officeData, chosen);
    const onPs = found && isPracticeSquad(found.player.seasons?.[currentLeagueYear()]);
    select.append(new Option(`${found ? found.player.name : "Removed player"} (${onPs ? "practice squad, not elevated" : "not on roster"})${dcOverall(chosen) !== null ? ` · ${dcOverall(chosen)}` : ""}`, chosen));
    select.classList.add("is-stale");
  }
  select.value = chosen || "";
  select.classList.toggle("is-empty", !chosen);
  select.disabled = !storageIsAvailable;
  return select;
}

function renderDepthChart() {
  if (!depthPanel) return;
  dcOverallCache = new Map(); // picks or rating changes since the last render show up
  const chart = depthChartFor(activeTeamId);
  const roster = depthRoster();
  const team = nflTeams.find(({ id }) => id === activeTeamId);

  const head = document.createElement("div");
  head.className = "depth-head";
  const title = document.createElement("div");
  title.innerHTML = '<span class="panel-index">DEPTH CHART</span>';
  const h3 = document.createElement("h3");
  h3.textContent = `${team.name} Depth Chart`;
  title.append(h3);
  const actions = document.createElement("div");
  actions.className = "depth-actions";
  const auto = document.createElement("button");
  auto.type = "button";
  auto.className = "workspace-button";
  auto.dataset.action = "autofill";
  auto.textContent = "Fill empty spots by position";
  auto.title = "Fills only the empty spots: best-fitting positions first, then highest overall";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "workspace-button";
  clear.dataset.action = "clear";
  clear.textContent = "Clear depth chart";
  const bestBtn = document.createElement("button");
  bestBtn.type = "button";
  bestBtn.className = "button button-lime";
  bestBtn.dataset.action = "best";
  bestBtn.textContent = "Generate best lineup";
  bestBtn.title = "Puts the best available player (highest league overall) at every spot; no one starts at two offensive/defensive positions";
  actions.append(bestBtn, auto, clear);
  head.append(title, actions);

  const layout = document.createElement("div");
  layout.className = "depth-layout";
  const sections = document.createElement("div");
  sections.className = "depth-sections";
  sections.append(formationView(chart, roster));
  const schemes = document.createElement("aside");
  schemes.className = "depth-schemes";
  const sh = document.createElement("h4");
  sh.textContent = "Team Schemes:";
  schemes.append(sh);
  for (const [field, label, list] of [["offense", "Offensive Scheme:", offenseSchemes], ["defense", "Defensive Scheme:", defenseSchemes], ["offPlaybook", "Offensive Playbook:", null], ["defPlaybook", "Defensive Playbook:", null]]) {
    const row = document.createElement("label");
    row.className = "depth-scheme-row";
    const span = document.createElement("span");
    span.textContent = label;
    let input;
    if (list) {
      // Dropdown of the league's schemes (an older typed value outside the list is kept as its own choice).
      input = document.createElement("select");
      input.className = "depth-scheme-select";
      const current = chart.schemes[field] || "";
      input.append(new Option("Choose a scheme", ""), ...list.map((v) => new Option(v, v)));
      if (current && !list.includes(current)) input.append(new Option(`${current} (not in list)`, current));
      input.value = current;
      input.classList.toggle("is-empty", !current);
    } else {
      input = document.createElement("input");
      input.maxLength = depthSchemeFields[field];
      input.value = chart.schemes[field] || "";
      input.placeholder = "Team Name";
    }
    input.dataset.scheme = field;
    input.disabled = !storageIsAvailable;
    input.setAttribute("aria-label", label.replace(":", ""));
    row.append(span, input);
    schemes.append(row);
  }
  const counts = document.createElement("p");
  counts.className = "depth-count";
  const filled = Object.values(chart.slots).reduce((t, ids) => t + ids.filter(Boolean).length, 0);
  const total = Object.values(depthSlotSizes).reduce((a, b) => a + b, 0);
  counts.textContent = roster.length
    ? `${filled} of ${total} spots filled · ${roster.length} players on the ${currentLeagueYear()} roster`
    : `No players on this team's ${currentLeagueYear()} salary sheet yet. Add players on the ${currentLeagueYear()} tab to build the depth chart.`;
  schemes.append(counts);

  sections.append(autoSubsSection(chart));
  layout.append(sections, schemes);
  depthPanel.replaceChildren(head, layout);
}
globalThis.renderDepthChart = renderDepthChart;

// ---- Auto subs: In / Out thresholds (0–100) per position group, like Madden's auto-sub sliders. ----
function autoSubsSection(chart) {
  chart.autoSubs = chart.autoSubs || {};
  const section = document.createElement("section");
  section.className = "depth-section depth-subs";
  const h4 = document.createElement("h4");
  h4.textContent = "Auto Subs";
  const note = document.createElement("p");
  note.className = "depth-subs-note";
  note.textContent = "Drag a slider or type a number from 0 to 100. Blank means not set.";
  const tables = document.createElement("div");
  tables.className = "depth-subs-tables";
  for (const [side, groups] of autoSubGroups) {
    const table = document.createElement("table");
    table.className = "depth-subs-table";
    const cap = document.createElement("caption");
    cap.textContent = side;
    const head = table.createTHead().insertRow();
    for (const label of ["Position", "In (0-100)", "Out (0-100)"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      head.append(th);
    }
    const body = table.createTBody();
    for (const group of groups) {
      const row = body.insertRow();
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = group;
      row.append(th);
      for (const dir of ["in", "out"]) {
        const cell = row.insertCell();
        const value = chart.autoSubs[group]?.[dir];
        const wrap = document.createElement("div");
        wrap.className = `depth-sub${value == null ? " is-unset" : ""}`;
        const range = document.createElement("input");
        range.type = "range";
        range.min = "0";
        range.max = "100";
        range.step = "1";
        range.value = String(value ?? 50);
        range.dataset.sub = group;
        range.dataset.dir = dir;
        range.setAttribute("aria-label", `${group} auto sub ${dir}`);
        range.disabled = !storageIsAvailable;
        const number = document.createElement("input");
        number.type = "number";
        number.min = "0";
        number.max = "100";
        number.step = "1";
        number.inputMode = "numeric";
        number.value = value == null ? "" : String(value);
        number.placeholder = "—";
        number.dataset.sub = group;
        number.dataset.dir = dir;
        number.setAttribute("aria-label", `${group} auto sub ${dir} value`);
        number.disabled = !storageIsAvailable;
        wrap.append(range, number);
        cell.append(wrap);
      }
    }
    table.prepend(cap);
    tables.append(table);
  }
  section.append(h4, note, tables);
  return section;
}

// Live readout while dragging; saved on release (the change event).
depthPanel?.addEventListener("input", (event) => {
  const range = event.target.closest('input[type="range"][data-sub]');
  if (!range) return;
  const wrap = range.parentElement;
  wrap.classList.remove("is-unset");
  wrap.querySelector('input[type="number"]').value = range.value;
});

// ---- Stream updates: every depth chart change is queued for the commissioner (Admin → Stream Updates). ----
function depthName(id) {
  if (!id) return "";
  const found = findPlayerById(officeData, id);
  return found ? found.player.name : "Removed player";
}
const copySlots = (chart) => JSON.parse(JSON.stringify(chart.slots || {}));
function slotChanges(before, after) {
  const changes = [];
  for (const [, rows] of depthChartSections) {
    for (const [slot, size] of rows) {
      for (let i = 0; i < size; i += 1) {
        const from = (before[slot] || [])[i] || "";
        const to = (after[slot] || [])[i] || "";
        if (from !== to) changes.push({ slot, index: i, from: depthName(from), to: depthName(to) });
      }
    }
  }
  return changes;
}
function queueStream(changes) {
  if (typeof recordStreamUpdate === "function") recordStreamUpdate(officeData, activeTeamId, changes);
}

depthPanel?.addEventListener("change", (event) => {
  const chart = depthChartFor(activeTeamId);
  const select = event.target.closest("[data-slot]");
  if (select) {
    const slot = select.dataset.slot;
    const before = copySlots(chart);
    const ids = [...(chart.slots[slot] || [])];
    while (ids.length < depthSlotSizes[slot]) ids.push("");
    ids[Number(select.dataset.index)] = select.value;
    while (ids.length && !ids[ids.length - 1]) ids.pop();
    if (ids.length) chart.slots[slot] = ids; else delete chart.slots[slot];
    const player = select.value ? (findPlayerById(officeData, select.value)?.player.name || select.selectedOptions[0].textContent.replace(/ · \d+$/, "")) : "empty";
    queueStream(slotChanges(before, chart.slots));
    saveOfficeData(`${slot} ${Number(select.dataset.index) + 1}: ${player}. Sent to the commissioner's stream updates.`);
    renderDepthChart();
    return;
  }
  const sub = event.target.closest("[data-sub]");
  if (sub) {
    const group = sub.dataset.sub;
    const dir = sub.dataset.dir;
    chart.autoSubs = chart.autoSubs || {};
    const raw = sub.value.trim();
    const previous = chart.autoSubs[group]?.[dir];
    let value = raw === "" ? null : Math.round(Number(raw));
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      saveOfficeData("Auto sub values go from 0 to 100.");
      renderDepthChart();
      return;
    }
    const entry = { ...(chart.autoSubs[group] || {}) };
    if (value === null) delete entry[dir]; else entry[dir] = value;
    if (Object.keys(entry).length) chart.autoSubs[group] = entry; else delete chart.autoSubs[group];
    if ((previous ?? null) !== value) queueStream([{ slot: `sub:${group}:${dir}`, index: -1, from: previous == null ? "" : String(previous), to: value === null ? "" : String(value) }]);
    saveOfficeData(`${group} auto sub ${dir === "in" ? "In" : "Out"}: ${value === null ? "not set" : value}. Sent to the commissioner's stream updates.`);
    renderDepthChart();
    return;
  }
  const input = event.target.closest("[data-scheme]");
  if (input) {
    const value = input.value.trim().slice(0, depthSchemeFields[input.dataset.scheme]);
    const previous = chart.schemes[input.dataset.scheme] || "";
    if (value) chart.schemes[input.dataset.scheme] = value; else delete chart.schemes[input.dataset.scheme];
    if (previous !== value) queueStream([{ slot: `scheme:${input.dataset.scheme}`, index: -1, from: previous, to: value }]);
    saveOfficeData("Team schemes saved. Sent to the commissioner's stream updates.");
    if (input.dataset.scheme === "defense") { if (value !== previous) dcTab = "defense"; renderDepthChart(); } // the front follows the scheme
  }
});

depthPanel?.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-dc-tab]");
  if (tab) { dcTab = tab.dataset.dcTab; renderDepthChart(); return; }
  const button = event.target.closest("[data-action]");
  if (!button || !storageIsAvailable) return;
  const chart = depthChartFor(activeTeamId);
  if (button.dataset.action === "clear") {
    if (!await confirmAction("Clear every spot on this depth chart? Team schemes are kept.", { confirmLabel: "Clear depth chart", danger: true })) return;
    const before = copySlots(chart);
    chart.slots = {};
    queueStream(slotChanges(before, chart.slots));
    saveOfficeData("Depth chart cleared.");
    renderDepthChart();
    return;
  }
  // "Fill empty spots" keeps what's there; "Best lineup" starts over. Both: starters on Offense/Defense first (each
  // player starts at one spot only), then backups and Special Teams/Specialists (which may repeat players, as Madden allows).
  const best = button.dataset.action === "best";
  if (best && !await confirmAction("Replace this whole depth chart with the best available player at every spot (by league overall)? Team schemes and auto subs are kept.", { confirmLabel: "Set best lineup" })) return;
  const roster = depthRoster();
  const beforeFill = copySlots(chart);
  const ovr = (p) => dcOverall(p.id) ?? -1;
  const slotList = depthChartSections.flatMap(([, rows]) => rows.map(([slot, size]) => ({ slot, size })));
  const ids = Object.fromEntries(slotList.map(({ slot, size }) => {
    const list = best ? [] : [...(chart.slots[slot] || [])];
    while (list.length < size) list.push("");
    return [slot, list];
  }));
  const starterSpots = [...dcStarterSpots(chart).keys()].map((key) => { const [slot, index] = key.split(":"); return { slot, index: Number(index) }; });
  const isStarterSpot = new Set(starterSpots.map(({ slot, index }) => `${slot}:${index}`));
  const starters = new Set(starterSpots.map(({ slot, index }) => ids[slot][index]).filter(Boolean));
  // Best fit = highest overall; ties go to the more natural position, then the bigger cap hit.
  const score = (slot, p) => (best ? ovr(p) * 1000 : (99 - fitRank(slot, p.position)) * 100000 + ovr(p) * 1000) - fitRank(slot, p.position) * 10 + Math.min(9, p.cap / 5e6);
  const ranked = (slot) => roster.filter((p) => fitRank(slot, p.position) < 99).sort((x, y) => score(slot, y) - score(slot, x));
  let added = 0;
  // Starters: the best player/spot pairs first, across every starting spot at once.
  const pairs = [];
  for (const { slot, index } of starterSpots) {
    if (ids[slot][index]) continue;
    for (const p of ranked(slot)) pairs.push({ slot, index, p, value: score(slot, p) });
  }
  pairs.sort((a, b) => b.value - a.value);
  for (const { slot, index, p } of pairs) {
    if (ids[slot][index] || starters.has(p.id)) continue;
    ids[slot][index] = p.id;
    starters.add(p.id);
    added += 1;
  }
  // Everything else, spot by spot: best available not already listed in that slot (non-starters first for offense/defense backups).
  const shareable = new Set(depthChartSections.filter(([section]) => section !== "Offense" && section !== "Defense").flatMap(([, rows]) => rows.map(([slot]) => slot)));
  for (const { slot, size } of slotList) {
    for (let i = 0; i < size; i += 1) {
      if (ids[slot][i] || isStarterSpot.has(`${slot}:${i}`)) continue;
      const pool = ranked(slot).filter((p) => !ids[slot].includes(p.id));
      const pick = shareable.has(slot) ? pool[0] : (pool.find((p) => !starters.has(p.id)) || pool[0]);
      if (!pick) continue;
      ids[slot][i] = pick.id;
      added += 1;
    }
  }
  for (const { slot } of slotList) {
    const list = ids[slot];
    while (list.length && !list[list.length - 1]) list.pop();
    if (list.length) chart.slots[slot] = list; else delete chart.slots[slot];
  }
  queueStream(slotChanges(beforeFill, chart.slots));
  saveOfficeData(best ? `Best lineup set: ${added} spots filled by league overall. Change any of them with the dropdowns.`
    : added ? `Filled ${added} empty ${added === 1 ? "spot" : "spots"} by position. Change any of them with the dropdowns.` : "No empty spots could be filled: no more players fit those positions.");
  renderDepthChart();
});

// The team sheet may already be on this tab (team.html#depth-chart) before this script loaded.
if (depthPanel && !depthPanel.hidden) renderDepthChart();
