// League History › Previous Drafts (drafts.html). One league draft at a time, from the league's first season (2024)
// to this year: the picks recorded in data.draftHistory. Commissioners enter picks one at a time (pick, team, player,
// position, school; round fills in from the pick), edit or remove them, or paste a whole draft. The real NFL draft
// (nfl-drafts.js) is only offered as a starting point to paste from.
const leagueFirstDraft = 2024;
const drYear = document.querySelector("#dr-year");
const drTeam = document.querySelector("#dr-team");
const drSearch = document.querySelector("#dr-search");
const drStatus = document.querySelector("#dr-status");
let drRound = 0; // 0 = all rounds

let drData = emptyOfficeData();
let drCanSave = true;
try { drData = readStoredOffice() || emptyOfficeData(); } catch { drCanSave = false; }

const drNfl = typeof nflDraftHistory === "object" ? nflDraftHistory : {};
const drLeague = () => (Array.isArray(drData.draftHistory) ? drData.draftHistory : []);
const drYears = () => {
  const last = Math.max(currentLeagueYear(), ...drLeague().map((d) => d.year));
  const years = [];
  for (let y = last; y >= leagueFirstDraft; y -= 1) years.push(y);
  return years;
};
let drEditing = null; // id of the pick being edited

// The picks for a year: { source: "league" | "nfl", picks: [{ id?, round, pick, teamId, player, position, college }] }
function drPicksFor(year) {
  return { source: "league", picks: drLeague().filter((d) => d.year === year).sort((a, b) => a.pick - b.pick || a.round - b.round) };
}

// Where each drafted player is in this league now (salary sheets and Player Contracts), by name.
function drWhereNow() {
  const map = new Map();
  for (const { id } of nflTeams) for (const p of drData.teams[id]?.roster || []) map.set(normalizePlayerName(p.name), { id: p.id, teamId: id });
  for (const p of drData.contractPlayers || []) if (!map.has(normalizePlayerName(p.name))) map.set(normalizePlayerName(p.name), { id: p.id, teamId: p.team });
  return map;
}


function drRender() {
  const year = Number(drYear.value);
  const { source, picks } = drPicksFor(year);
  document.querySelector("#dr-year-title").textContent = String(year);
  document.querySelector("#dr-source").textContent = picks.length
    ? `The league's ${year} draft: ${picks.length} pick${picks.length === 1 ? "" : "s"} recorded.`
    : `No picks recorded for the ${year} draft yet. Enter them below, one at a time or pasted all at once.`;
  if (!drEditing) document.querySelector("#dr-entry-title").textContent = `Add a pick to the ${year} draft`;
  // Round tabs
  const rounds = [...new Set(picks.map((p) => p.round))].sort((a, b) => a - b);
  if (drRound && !rounds.includes(drRound)) drRound = 0;
  const tabs = document.querySelector("#dr-rounds");
  tabs.replaceChildren(...[0, ...rounds].map((r) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `season-tab${r === drRound ? " is-active" : ""}`;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(r === drRound));
    b.textContent = r ? `Round ${r}` : "All rounds";
    b.addEventListener("click", () => { drRound = r; drRender(); });
    return b;
  }));
  // First-round headline: the top three picks.
  const firsts = document.querySelector("#dr-firsts");
  firsts.replaceChildren(...picks.filter((p) => p.round === 1).slice(0, 3).map((p) => {
    const card = document.createElement("div");
    card.className = "dr-first";
    const n = document.createElement("span");
    n.className = "dr-first-pick";
    n.textContent = `No. ${p.pick}${p.compensatory ? "*" : ""}`;
    const name = document.createElement("strong");
    name.textContent = p.player;
    const meta = document.createElement("span");
    meta.className = "dr-first-meta";
    meta.textContent = [p.position, p.college].filter(Boolean).join(" · ");
    card.append(n, drTeamTag(p.teamId), name, meta);
    if (p.fromTeam) { const via = document.createElement("span"); via.className = "dr-via"; via.textContent = `Pick from ${teamName(p.fromTeam)}`; card.insertBefore(via, name); }
    return card;
  }));
  // Table
  const team = drTeam.value;
  const query = drSearch.value.trim().toLowerCase();
  const now = drWhereNow();
  const shown = picks.filter((p) => (!drRound || p.round === drRound) && (!team || p.teamId === team) &&
    (!query || `${p.player} ${p.position || ""} ${p.college || ""}`.toLowerCase().includes(query)));
  document.querySelector("#dr-rows").replaceChildren(...shown.map((p) => {
    const tr = document.createElement("tr");
    tr.insertCell().textContent = p.round;
    const pickCell = tr.insertCell();
    pickCell.textContent = drPickText(p);
    if (p.compensatory) { pickCell.title = `Compensatory pick, round ${p.round}`; pickCell.className = "dr-comp"; }
    const teamCell = tr.insertCell();
    teamCell.append(drTeamTag(p.teamId));
    if (p.fromTeam) {
      const via = document.createElement("span");
      via.className = "dr-via";
      via.textContent = `from ${p.fromTeam}`;
      via.title = `${teamName(p.teamId)} got this pick from the ${teamName(p.fromTeam)}`;
      teamCell.append(via);
    }
    const nameCell = tr.insertCell();
    const here = now.get(normalizePlayerName(p.player));
    if (here) {
      const a = document.createElement("a");
      a.href = `player.html?id=${encodeURIComponent(here.id)}`;
      a.textContent = p.player;
      nameCell.append(a);
    } else nameCell.textContent = p.player;
    nameCell.className = "dr-player";
    tr.insertCell().textContent = p.position || "";
    tr.insertCell().textContent = p.college || "";
    const nowCell = tr.insertCell();
    if (here) {
      if (here.teamId && here.teamId !== freeAgentTeamId && nflTeams.some(({ id }) => id === here.teamId)) nowCell.append(drTeamTag(here.teamId));
      else nowCell.textContent = "Free agent";
    } else nowCell.textContent = "—";
    const edit = tr.insertCell();
    edit.className = "dr-col-edit";
    if (source === "league" && drCanSave) {
      const e = document.createElement("button");
      e.type = "button";
      e.className = "workspace-button dr-edit";
      e.textContent = "Edit";
      e.setAttribute("aria-label", `Edit pick ${p.pick}, ${p.player}`);
      e.addEventListener("click", () => drStartEdit(p));
      edit.append(e);
      const x = document.createElement("button");
      x.type = "button";
      x.className = "row-delete";
      x.textContent = "×";
      x.setAttribute("aria-label", `Remove ${p.player} from the ${year} draft`);
      x.addEventListener("click", async () => {
        if (!(await confirmAction(`Remove ${p.player} (pick ${p.pick}) from the league's ${year} draft?`, { confirmLabel: "Remove pick", danger: true }))) return;
        drSave((list) => list.filter((d) => d.id !== p.id), `${p.player} removed from the ${year} draft.`);
        if (drEditing === p.id) drResetEntry();
      });
      edit.append(x);
    }
    return tr;
  }));
  document.querySelector("#dr-legend").hidden = !picks.some((p) => p.compensatory);
  const empty = document.querySelector("#dr-empty");
  empty.hidden = shown.length > 0;
  empty.textContent = picks.length ? "No picks match." : `The ${year} draft is empty. Add the first pick below.`;
  document.querySelector("#dr-edit-year").value = String(year);
}

function drSave(change, message) {
  if (!drCanSave) { drStatus.textContent = "Saved league data couldn't be read, so nothing can be saved here."; return false; }
  const next = change(drLeague());
  for (const year of new Set(next.map((d) => d.year))) drReround(next, year);
  drData.draftHistory = next;
  try {
    writeStoredOffice(drData);
  } catch (error) {
    drStatus.textContent = `Couldn't save: ${error.message}.`;
    try { drData = readStoredOffice() || emptyOfficeData(); } catch { /* keep */ }
    return false;
  }
  drStatus.textContent = message;
  drFillYears();
  drRender();
  return true;
}


const drEditYear = () => Number(document.querySelector("#dr-edit-year").value);
document.querySelector("#dr-copy-nfl").addEventListener("click", () => {
  const year = drEditYear();
  const rows = drNfl[year];
  if (!rows) { drStatus.textContent = `There's no NFL draft on file for ${year || "that year"}.`; return; }
  document.querySelector("#dr-paste").value = rows.map(([round, pick, team, player, position, college]) => [round, pick, team, player, position, college].join(", ")).join("\n");
  drStatus.textContent = `The ${year} NFL draft is in the box. Change any picks, then Save draft.`;
});
document.querySelector("#dr-save").addEventListener("click", async () => {
  const year = drEditYear();
  if (!isIntegerInRange(year, 1936, 2100)) { drStatus.textContent = "Enter the draft year."; return; }
  const { picks, errors } = drParse(document.querySelector("#dr-paste").value, year);
  drShowSkipped(errors);
  if (!picks.length) { drStatus.textContent = errors.length ? "No picks could be read; the lines are listed under the box with the reason." : "Paste the picks first."; return; }
  const dupes = picks.length - new Set(picks.map((p) => p.pick)).size;
  const replacing = drLeague().filter((d) => d.year === year).length;
  if (replacing && !(await confirmAction(`Replace the league's ${replacing} recorded picks for ${year} with these ${picks.length}?`, { confirmLabel: "Replace draft" }))) return;
  drYear.value = String(year);
  if (drSave((list) => [...list.filter((d) => d.year !== year), ...picks], `Saved the league's ${year} draft: ${picks.length} picks.${errors.length ? ` ${errors.length} line${errors.length === 1 ? " was" : "s were"} skipped; they're listed under the box so you can fix them and save again.` : ""}${dupes ? ` ${dupes} pick number${dupes === 1 ? " appears" : "s appear"} twice.` : ""}`)) {
    drYear.value = String(year);
    drRender();
  }
});
// Lines a paste couldn't read, with the reason, so they can be fixed in the box and saved again.
function drShowSkipped(errors) {
  const box = document.querySelector("#dr-skipped");
  box.hidden = !errors.length;
  if (!errors.length) return;
  box.querySelector("summary").textContent = `${errors.length} line${errors.length === 1 ? "" : "s"} skipped`;
  box.querySelector("ul").replaceChildren(...errors.map(({ line, text, why }) => {
    const li = document.createElement("li");
    const b = document.createElement("strong");
    b.textContent = `Line ${line}: ${why}. `;
    const code = document.createElement("code");
    code.textContent = text;
    li.append(b, code);
    return li;
  }));
  box.open = true;
}

document.querySelector("#dr-delete").addEventListener("click", async () => {
  const year = drEditYear();
  const count = drLeague().filter((d) => d.year === year).length;
  if (!count) { drStatus.textContent = `The league has no recorded picks for ${year}.`; return; }
  if (!(await confirmAction(`Delete the league's ${count} recorded picks for ${year}? The page will show the real NFL draft for that year instead.`, { confirmLabel: "Delete picks", danger: true }))) return;
  drSave((list) => list.filter((d) => d.year !== year), `Deleted the league's ${year} draft.`);
});

function drFillYears() {
  const counts = new Map();
  for (const d of drLeague()) counts.set(d.year, (counts.get(d.year) || 0) + 1);
  const label = (y) => `${y}${counts.get(y) ? ` · ${counts.get(y)} picks` : " · not entered"}`;
  for (const select of [drYear, document.querySelector("#dr-edit-year")]) {
    const keep = select.value;
    select.replaceChildren(...drYears().map((y) => new Option(select === drYear ? label(y) : String(y), String(y))));
    if (keep && [...select.options].some((o) => o.value === keep)) select.value = keep;
  }
}

// ---------- Enter one pick ----------
const drForm = document.querySelector("#dr-entry");
drForm.elements.team.append(...[...nflTeams].sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name }) => new Option(name, id)));
drForm.elements.fromTeam.append(...[...nflTeams].sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name }) => new Option(`${name} (${id})`, id)));
function drAutoRound() {
  const parsed = drParsePick(drForm.elements.pick.value);
  if (drForm.elements.round.dataset.touched) return;
  if (!parsed) { drForm.elements.round.value = ""; return; }
  const year = Number(drYear.value);
  const comps = drLeague().filter((d) => d.year === year && d.compensatory && d.pick < parsed.pick && d.id !== drEditing).length;
  drForm.elements.round.value = drRoundFrom(parsed.pick, parsed.compensatory, comps);
}
drForm.elements.pick.addEventListener("input", drAutoRound);
drForm.elements.round.addEventListener("input", () => { drForm.elements.round.dataset.touched = "1"; });

function drResetEntry() {
  drEditing = null;
  drForm.reset();
  delete drForm.elements.round.dataset.touched;
  document.querySelector("#dr-entry-kicker").textContent = "ENTER A PICK";
  document.querySelector("#dr-entry-title").textContent = `Add a pick to the ${drYear.value} draft`;
  document.querySelector("#dr-add").textContent = "Add pick";
  document.querySelector("#dr-cancel").hidden = true;
}

function drStartEdit(p) {
  drEditing = p.id;
  const f = drForm.elements;
  f.pick.value = `${p.pick}${p.compensatory ? "*" : ""}`;
  f.round.value = p.round;
  if (p.roundManual) f.round.dataset.touched = "1"; else delete f.round.dataset.touched;
  f.team.value = p.teamId;
  f.fromTeam.value = p.fromTeam || "";
  f.player.value = p.player;
  f.position.value = p.position || "";
  f.college.value = p.college || "";
  document.querySelector("#dr-entry-kicker").textContent = "EDIT PICK";
  document.querySelector("#dr-entry-title").textContent = `Edit pick ${p.pick} of the ${drYear.value} draft`;
  document.querySelector("#dr-add").textContent = "Save pick";
  document.querySelector("#dr-cancel").hidden = false;
  drForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  f.player.focus({ preventScroll: true });
}
document.querySelector("#dr-cancel").addEventListener("click", drResetEntry);

drForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!drForm.reportValidity()) return;
  const f = drForm.elements;
  const year = Number(drYear.value);
  const parsed = drParsePick(f.pick.value);
  if (!parsed || !isIntegerInRange(parsed.pick, 1, 400)) { drStatus.textContent = "Enter the pick number, with a * after it for a compensatory pick (e.g. 97*)."; f.pick.focus(); return; }
  const { pick, compensatory } = parsed;
  const manual = Boolean(f.round.dataset.touched && Number(f.round.value));
  const entry = { id: drEditing || newRecordId("draft"), year, round: Number(f.round.value) || 1, pick, teamId: f.team.value, player: f.player.value.trim().slice(0, 70) };
  if (compensatory) entry.compensatory = true;
  if (manual) entry.roundManual = true;
  if (f.fromTeam.value && f.fromTeam.value !== entry.teamId) entry.fromTeam = f.fromTeam.value;
  if (f.position.value.trim()) entry.position = f.position.value.trim().toUpperCase().slice(0, 10);
  if (f.college.value.trim()) entry.college = f.college.value.trim().slice(0, 80);
  const clash = drLeague().find((d) => d.year === year && d.pick === pick && d.id !== entry.id);
  if (clash && !(await confirmAction(`Pick ${pick} in ${year} is already ${clash.player}. Replace him with ${entry.player}?`, { confirmLabel: "Replace pick" }))) return;
  const editing = drEditing;
  const ok = drSave((list) => [...list.filter((d) => d.id !== entry.id && d !== clash), entry],
    editing ? `Pick ${pick} updated: ${entry.player}.` : `Pick ${pick} added: ${entry.player} to the ${teamName(entry.teamId)}.`);
  if (!ok) return;
  if (editing) { drResetEntry(); return; }
  // Ready for the next pick.
  drResetEntry();
  f.pick.value = pick + 1;
  drAutoRound();
  f.team.focus();
});

drTeam.append(...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
drFillYears();
const drAsked = Number(new URLSearchParams(location.search).get("year"));
if (drAsked && [...drYear.options].some((o) => o.value === String(drAsked))) drYear.value = String(drAsked);
else { const firstWithPicks = drYears().find((y) => drLeague().some((d) => d.year === y)); if (firstWithPicks) drYear.value = String(firstWithPicks); }
for (const control of [drYear, drTeam]) control.addEventListener("change", () => {
  if (control === drYear) { history.replaceState(null, "", `?year=${drYear.value}`); drResetEntry(); drStatus.textContent = ""; }
  drRender();
});
drSearch.addEventListener("input", drRender);
if (!drCanSave) { document.querySelector("#dr-editor").hidden = true; drForm.hidden = true; }
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { drData = readStoredOffice() || emptyOfficeData(); drFillYears(); drRender(); } catch { /* keep the current view */ }
});
drRender();
