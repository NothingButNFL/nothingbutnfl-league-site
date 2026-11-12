// League History › Previous Drafts (drafts.html). Shows one draft year at a time: the league's own recorded picks
// (data.draftHistory) when that year has any, otherwise the real NFL draft from nfl-drafts.js. Commissioners can paste
// the league's picks for a year, start from the NFL draft and edit it, or remove single picks.
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
const drYears = () => [...new Set([...Object.keys(drNfl).map(Number), ...drLeague().map((d) => d.year)])].sort((a, b) => b - a);
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th"}`;

// The picks for a year: { source: "league" | "nfl", picks: [{ id?, round, pick, teamId, player, position, college }] }
function drPicksFor(year) {
  const league = drLeague().filter((d) => d.year === year);
  if (league.length) return { source: "league", picks: [...league].sort((a, b) => a.pick - b.pick || a.round - b.round) };
  return { source: "nfl", picks: (drNfl[year] || []).map(([round, pick, teamId, player, position, college]) => ({ round, pick, teamId, player, position, college })) };
}

// Where each drafted player is in this league now (salary sheets and Player Contracts), by name.
function drWhereNow() {
  const map = new Map();
  for (const { id } of nflTeams) for (const p of drData.teams[id]?.roster || []) map.set(normalizePlayerName(p.name), { id: p.id, teamId: id });
  for (const p of drData.contractPlayers || []) if (!map.has(normalizePlayerName(p.name))) map.set(normalizePlayerName(p.name), { id: p.id, teamId: p.team });
  return map;
}

function drTeamTag(teamId) {
  const team = nflTeams.find(({ id }) => id === teamId);
  const tag = document.createElement("a");
  tag.className = "dr-team";
  tag.href = `team.html?team=${encodeURIComponent(teamId)}`;
  tag.title = team?.name || teamId;
  const img = document.createElement("img");
  img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team?.logo || teamId.toLowerCase()}.png`;
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => img.remove(), { once: true });
  tag.append(img, teamId);
  return tag;
}

function drRender() {
  const year = Number(drYear.value);
  const { source, picks } = drPicksFor(year);
  document.querySelector("#dr-year-title").textContent = String(year);
  document.querySelector("#dr-source").textContent = source === "league"
    ? `The league's ${year} draft, ${picks.length} picks.`
    : `The real ${year} NFL Draft (${picks.length} picks, from nflverse's draft records). Record the league's own ${year} draft below to show it here instead.`;
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
    n.textContent = `No. ${p.pick}`;
    const name = document.createElement("strong");
    name.textContent = p.player;
    const meta = document.createElement("span");
    meta.className = "dr-first-meta";
    meta.textContent = [p.position, p.college].filter(Boolean).join(" · ");
    card.append(n, drTeamTag(p.teamId), name, meta);
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
    tr.insertCell().textContent = ordinal(p.pick);
    tr.insertCell().append(drTeamTag(p.teamId));
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
      const x = document.createElement("button");
      x.type = "button";
      x.className = "row-delete";
      x.textContent = "×";
      x.setAttribute("aria-label", `Remove ${p.player} from the ${year} draft`);
      x.addEventListener("click", async () => {
        if (!(await confirmAction(`Remove ${p.player} (pick ${p.pick}) from the league's ${year} draft?`, { confirmLabel: "Remove pick", danger: true }))) return;
        drSave((list) => list.filter((d) => d.id !== p.id), `${p.player} removed from the ${year} draft.`);
      });
      edit.append(x);
    }
    return tr;
  }));
  document.querySelector("#dr-empty").hidden = shown.length > 0;
  document.querySelector("#dr-edit-year").value = year;
}

function drSave(change, message) {
  if (!drCanSave) { drStatus.textContent = "Saved league data couldn't be read, so nothing can be saved here."; return false; }
  const next = change(drLeague());
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

// "1, 1, LV, Fernando Mendoza, QB, Indiana" (commas or tabs). Returns { picks, errors }.
function drParse(text, year) {
  const picks = [], errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(line.includes("\t") ? "\t" : ",").map((c) => c.trim());
    if (i === 0 && /round/i.test(cells[0])) return; // header row
    const [round, pick, team, player, position, college] = cells;
    const teamId = lookupTeamId(team || "") || (nflTeams.some(({ id }) => id === (team || "").toUpperCase()) ? team.toUpperCase() : null);
    if (!isIntegerInRange(Number(round), 1, 20) || !isIntegerInRange(Number(pick), 1, 400) || !teamId || !player) {
      errors.push(`Line ${i + 1}: ${line.trim().slice(0, 60)}`);
      return;
    }
    const entry = { id: newRecordId("draft"), year, round: Number(round), pick: Number(pick), teamId, player: player.slice(0, 70) };
    if (position) entry.position = position.slice(0, 10);
    if (college) entry.college = college.slice(0, 80);
    picks.push(entry);
  });
  return { picks, errors };
}

const drEditYear = () => Number(document.querySelector("#dr-edit-year").value);
document.querySelector("#dr-copy-nfl").addEventListener("click", () => {
  const year = drEditYear();
  const rows = drNfl[year];
  if (!rows) { drStatus.textContent = `There's no NFL draft on file for ${year || "that year"} (2010–2026 are).`; return; }
  document.querySelector("#dr-paste").value = rows.map((r) => r.join(", ")).join("\n");
  drStatus.textContent = `The ${year} NFL draft is in the box. Change any picks, then Save draft.`;
});
document.querySelector("#dr-save").addEventListener("click", async () => {
  const year = drEditYear();
  if (!isIntegerInRange(year, 1936, 2100)) { drStatus.textContent = "Enter the draft year."; return; }
  const { picks, errors } = drParse(document.querySelector("#dr-paste").value, year);
  if (!picks.length) { drStatus.textContent = errors.length ? `No picks could be read. ${errors.slice(0, 3).join("; ")}` : "Paste the picks first."; return; }
  const replacing = drLeague().filter((d) => d.year === year).length;
  if (replacing && !(await confirmAction(`Replace the league's ${replacing} recorded picks for ${year} with these ${picks.length}?`, { confirmLabel: "Replace draft" }))) return;
  drYear.value = String(year);
  if (drSave((list) => [...list.filter((d) => d.year !== year), ...picks], `Saved the league's ${year} draft: ${picks.length} picks.${errors.length ? ` ${errors.length} line${errors.length === 1 ? "" : "s"} skipped (${errors.slice(0, 2).join("; ")}).` : ""}`)) {
    drYear.value = String(year);
    drRender();
  }
});
document.querySelector("#dr-delete").addEventListener("click", async () => {
  const year = drEditYear();
  const count = drLeague().filter((d) => d.year === year).length;
  if (!count) { drStatus.textContent = `The league has no recorded picks for ${year}.`; return; }
  if (!(await confirmAction(`Delete the league's ${count} recorded picks for ${year}? The page will show the real NFL draft for that year instead.`, { confirmLabel: "Delete picks", danger: true }))) return;
  drSave((list) => list.filter((d) => d.year !== year), `Deleted the league's ${year} draft.`);
});

function drFillYears() {
  const keep = drYear.value;
  const league = new Set(drLeague().map((d) => d.year));
  drYear.replaceChildren(...drYears().map((y) => new Option(`${y}${league.has(y) ? " · League" : ""}`, String(y))));
  if (keep && [...drYear.options].some((o) => o.value === keep)) drYear.value = keep;
}

drTeam.append(...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
drFillYears();
const drAsked = Number(new URLSearchParams(location.search).get("year"));
if (drAsked && [...drYear.options].some((o) => o.value === String(drAsked))) drYear.value = String(drAsked);
for (const control of [drYear, drTeam]) control.addEventListener("change", () => {
  if (control === drYear) history.replaceState(null, "", `?year=${drYear.value}`);
  drRender();
});
drSearch.addEventListener("input", drRender);
if (!drCanSave) document.querySelector("#dr-editor").hidden = true;
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { drData = readStoredOffice() || emptyOfficeData(); drFillYears(); drRender(); } catch { /* keep the current view */ }
});
drRender();
