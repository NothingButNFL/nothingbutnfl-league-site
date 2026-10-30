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
    const player = select.value ? select.selectedOptions[0].textContent : "empty";
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

// The team sheet may already be on this tab (team.html#depth-chart) before this script loaded.
if (depthPanel && !depthPanel.hidden) renderDepthChart();
