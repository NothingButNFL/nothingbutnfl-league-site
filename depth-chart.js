// Team sheet "Depth Chart" tab. Uses officeData / activeTeamId / saveOfficeData from front-office.js.
// Saved in officeData.depthCharts[teamId] (league-core.js validDepthCharts).
const depthPanel = document.querySelector("#depth-chart-panel");

// Positions that fit each depth-chart slot, best first. Empty list = anyone.
const depthFits = {
  QB: ["QB"], HB: ["HB", "RB"], FB: ["FB", "RB", "HB", "TE"], WR: ["WR"], TE: ["TE"],
  LT: ["LT", "OT", "T", "RT", "OL"], RT: ["RT", "OT", "T", "LT", "OL"], LG: ["LG", "OG", "G", "RG", "IOL", "OL"], RG: ["RG", "OG", "G", "LG", "IOL", "OL"], C: ["C", "IOL", "OG", "G", "OL"],
  LE: ["LE", "DE", "EDGE", "ED", "OLB", "DL"], RE: ["RE", "DE", "EDGE", "ED", "OLB", "DL"], DT: ["DT", "NT", "IDL", "DL", "DE"],
  SAM: ["SAM", "OLB", "SLB", "LB", "EDGE"], MIKE: ["MIKE", "MLB", "ILB", "LB"], WILL: ["WILL", "OLB", "WLB", "LB"],
  CB: ["CB", "NB", "DB"], FS: ["FS", "S", "SAF", "DB"], SS: ["SS", "S", "SAF", "DB"],
  K: ["K", "PK"], P: ["P"], LS: ["LS", "C", "TE"], KR: ["WR", "RB", "HB", "CB"], PR: ["WR", "CB", "RB", "HB"], KOS: ["K", "PK", "P"],
  "3DRB": ["RB", "HB"], GAD: ["RB", "HB", "WR"], PWHB: ["RB", "HB", "FB"], SLWR: ["WR"], RLE: ["DE", "EDGE", "OLB", "LE"], RRE: ["DE", "EDGE", "OLB", "RE"],
  RDT: ["DT", "DE", "DL"], NT: ["NT", "DT", "DL"], SUBLB: ["LB", "MLB", "ILB", "OLB"], SLCB: ["CB", "NB", "DB"]
};
const offenseSchemes = ["Multiple Power Run", "West Coast Zone Run", "Spread", "Air Raid", "Run and Shoot", "Pro Style", "Option", "Multiple", "Vertical Zone Run"];
const defenseSchemes = ["3-4 Under", "3-4 Two Gap", "3-4 Multiple", "4-3 Cover 3", "4-3 Cover 2", "4-3 Multiple", "4-3 Under", "Multiple 3-4", "Multiple 4-3", "Hybrid"];

function depthChartFor(teamId) {
  if (!officeData.depthCharts) officeData.depthCharts = {};
  if (!officeData.depthCharts[teamId]) officeData.depthCharts[teamId] = { slots: {}, schemes: {} };
  const chart = officeData.depthCharts[teamId];
  chart.slots = chart.slots || {};
  chart.schemes = chart.schemes || {};
  return chart;
}

function depthRoster() {
  const year = currentLeagueYear();
  return selectedTeamData().roster
    .filter((p) => !p.activeSeasons.length || p.activeSeasons.some((season) => season >= year))
    .map((p) => {
      const season = p.seasons[year] || p.seasons[p.activeSeasons[0]] || {};
      return { id: p.id, name: p.name, position: String(playerDisplayPosition(p, year) || "").toUpperCase(), cap: season.baseSalary !== undefined ? capHitFor(season) : 0 };
    });
}

const fitRank = (slot, position) => {
  const fits = depthFits[slot] || [];
  const first = position.split(/[\s/,-]+/).find(Boolean) || "";
  const i = fits.indexOf(first);
  return i === -1 ? 99 : i;
};

function slotSelect(slot, index, chosen, roster) {
  const select = document.createElement("select");
  select.className = "depth-select";
  select.dataset.slot = slot;
  select.dataset.index = String(index);
  select.setAttribute("aria-label", `${slot} ${index + 1}`);
  select.append(new Option("—", ""));
  const fits = roster.filter((p) => fitRank(slot, p.position) < 99).sort((a, b) => fitRank(slot, a.position) - fitRank(slot, b.position) || b.cap - a.cap || a.name.localeCompare(b.name));
  const others = roster.filter((p) => fitRank(slot, p.position) === 99).sort((a, b) => a.name.localeCompare(b.name));
  const label = (p) => `${p.name}${p.position ? ` (${p.position})` : ""}`;
  if (fits.length && others.length) {
    const a = document.createElement("optgroup");
    a.label = `Fits ${slot}`;
    a.append(...fits.map((p) => new Option(label(p), p.id)));
    const b = document.createElement("optgroup");
    b.label = "Everyone else";
    b.append(...others.map((p) => new Option(label(p), p.id)));
    select.append(a, b);
  } else {
    select.append(...[...fits, ...others].map((p) => new Option(label(p), p.id)));
  }
  if (chosen && !roster.some((p) => p.id === chosen)) {
    const found = findPlayerById(officeData, chosen);
    select.append(new Option(`${found ? found.player.name : "Removed player"} (not on roster)`, chosen));
    select.classList.add("is-stale");
  }
  select.value = chosen || "";
  select.classList.toggle("is-empty", !chosen);
  select.disabled = !storageIsAvailable;
  return select;
}

function renderDepthChart() {
  if (!depthPanel) return;
  const chart = depthChartFor(activeTeamId);
  const roster = depthRoster();
  const team = nflTeams.find(({ id }) => id === activeTeamId);

  const head = document.createElement("div");
  head.className = "depth-head";
  const title = document.createElement("div");
  title.innerHTML = '<span class="panel-index">DEPTH CHART</span>';
  const h3 = document.createElement("h3");
  h3.textContent = `${team.name} depth chart`;
  title.append(h3);
  const actions = document.createElement("div");
  actions.className = "depth-actions";
  const auto = document.createElement("button");
  auto.type = "button";
  auto.className = "workspace-button";
  auto.dataset.action = "autofill";
  auto.textContent = "Fill empty spots by position";
  auto.title = "Fills empty spots with the best-fitting players by position, highest cap hit first";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "workspace-button";
  clear.dataset.action = "clear";
  clear.textContent = "Clear depth chart";
  actions.append(auto, clear);
  head.append(title, actions);

  const layout = document.createElement("div");
  layout.className = "depth-layout";
  const sections = document.createElement("div");
  sections.className = "depth-sections";
  for (const [name, rows] of depthChartSections) {
    const section = document.createElement("section");
    section.className = "depth-section";
    const h4 = document.createElement("h4");
    h4.textContent = name;
    section.append(h4);
    const grid = document.createElement("div");
    grid.className = "depth-grid";
    for (const [slot, size] of rows) {
      const label = document.createElement("span");
      label.className = "depth-slot";
      label.textContent = `${slot}:`;
      label.title = { "3DRB": "Third-down back", GAD: "Gadget", PWHB: "Power back", SLWR: "Slot receiver", RLE: "Rush left end", RRE: "Rush right end", RDT: "Rush defensive tackle", NT: "Nose tackle", SUBLB: "Sub linebacker", SLCB: "Slot corner", KOS: "Kickoff specialist", SAM: "Strong-side LB", MIKE: "Middle LB", WILL: "Weak-side LB" }[slot] || slot;
      grid.append(label);
      const ids = chart.slots[slot] || [];
      for (let i = 0; i < 6; i += 1) {
        if (i < size) {
          const cell = document.createElement("label");
          cell.className = "depth-cell";
          const n = document.createElement("span");
          n.className = "depth-n";
          n.textContent = String(i + 1);
          cell.append(n, slotSelect(slot, i, ids[i], roster));
          grid.append(cell);
        } else {
          grid.append(Object.assign(document.createElement("span"), { className: "depth-blank" }));
        }
      }
    }
    section.append(grid);
    sections.append(section);
  }

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
    const input = document.createElement("input");
    input.dataset.scheme = field;
    input.maxLength = depthSchemeFields[field];
    input.value = chart.schemes[field] || "";
    input.placeholder = list ? list[0] : "Team Name";
    input.disabled = !storageIsAvailable;
    if (list) input.setAttribute("list", `depth-${field}-list`);
    row.append(span, input);
    schemes.append(row);
  }
  const lists = document.createElement("div");
  lists.hidden = true;
  for (const [field, list] of [["offense", offenseSchemes], ["defense", defenseSchemes]]) {
    const dl = document.createElement("datalist");
    dl.id = `depth-${field}-list`;
    dl.append(...list.map((v) => new Option(v, v)));
    lists.append(dl);
  }
  schemes.append(lists);
  const counts = document.createElement("p");
  counts.className = "depth-count";
  const filled = Object.values(chart.slots).reduce((t, ids) => t + ids.filter(Boolean).length, 0);
  const total = Object.values(depthSlotSizes).reduce((a, b) => a + b, 0);
  counts.textContent = roster.length
    ? `${filled} of ${total} spots filled · ${roster.length} players on the ${currentLeagueYear()} roster`
    : `No players on this team's ${currentLeagueYear()} salary sheet yet. Add players on the ${currentLeagueYear()} tab to build the depth chart.`;
  schemes.append(counts);

  layout.append(sections, schemes);
  depthPanel.replaceChildren(head, layout);
}
globalThis.renderDepthChart = renderDepthChart;

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
    const player = select.value ? select.selectedOptions[0].textContent : "empty";
    queueStream(slotChanges(before, chart.slots));
    saveOfficeData(`${slot} ${Number(select.dataset.index) + 1}: ${player}. Sent to the commissioner's stream updates.`);
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
  }
});

depthPanel?.addEventListener("click", async (event) => {
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
  // Autofill. Starters first: exact position matches, then close fits, each player starting at one spot where possible.
  // Then backups, which may repeat a player listed elsewhere (as Madden allows).
  const roster = depthRoster();
  const beforeFill = copySlots(chart);
  const starters = new Set();
  const slotList = depthChartSections.flatMap(([section, rows]) => rows.map(([slot, size]) => ({ slot, size, shareable: section !== "Offense" && section !== "Defense" })));
  for (const { slot } of slotList) { const first = (chart.slots[slot] || [])[0]; if (first) starters.add(first); }
  const ids = Object.fromEntries(slotList.map(({ slot, size }) => {
    const list = [...(chart.slots[slot] || [])];
    while (list.length < size) list.push("");
    return [slot, list];
  }));
  const ranked = (slot) => roster.filter((p) => fitRank(slot, p.position) < 99)
    .sort((x, y) => fitRank(slot, x.position) - fitRank(slot, y.position) || y.cap - x.cap);
  let added = 0;
  for (const exactOnly of [true, false]) {
    for (const { slot, shareable } of slotList) {
      if (ids[slot][0]) continue;
      const pick = ranked(slot).find((p) => (!exactOnly || fitRank(slot, p.position) === 0) && (shareable || !starters.has(p.id)));
      if (!pick) continue;
      ids[slot][0] = pick.id;
      if (!shareable) starters.add(pick.id);
      added += 1;
    }
  }
  for (const { slot, size } of slotList) {
    for (let i = 1; i < size; i += 1) {
      if (ids[slot][i]) continue;
      const pool = ranked(slot).filter((p) => !ids[slot].includes(p.id));
      const pick = pool.find((p) => !starters.has(p.id)) || pool[0];
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
  saveOfficeData(added ? `Filled ${added} empty ${added === 1 ? "spot" : "spots"} by position. Change any of them with the dropdowns.` : "No empty spots could be filled: no more players fit those positions.");
  renderDepthChart();
});
