// Season Information › Draft (draft.html): the live draft room for this year's draft, run by the commissioner on one
// screen. Shows the team on the clock (with the pick clock and who's up next; running out the clock skips the team),
// the skipped teams that can still make a late pick, the Draft Pool to pick from, a form for
// a player who isn't in the pool, and the board of picks made. Every pick is saved to data.draftHistory, so the draft
// also appears in League History › Previous Drafts. The order (data.draftOrder) and pool (data.draftPool) are set up
// under Draft setup. Uses league-core.js and draft-core.js.
const dkYear = currentLeagueYear();
const dkStatus = document.querySelector("#dk-status");
let dkData = emptyOfficeData();
let dkCanSave = true;
try { dkData = readStoredOffice() || emptyOfficeData(); } catch { dkCanSave = false; }
let dkRound = 0; // board tab: 0 = the round on the clock

const dkOrder = () => draftOrderFor(dkData, dkYear); // open picks' teams come from Draft Pick Manager
const dkPicks = () => (dkData.draftHistory || []).filter((d) => d.year === dkYear);
const dkPool = () => (dkData.draftPool || []).filter((p) => p.year === dkYear);
const dkMadeAt = (pick) => dkPicks().find((d) => d.pick === pick);
// League rule: a team that runs out the whole pick clock is skipped and the next team picks. A skipped team can make
// its pick at any time afterwards, but only from the players still in the pool then. Skipped picks keep their number.
const dkOnClock = () => dkOrder().find((slot) => !dkMadeAt(slot.pick) && !slot.skipped) || null;
const dkSkippedSlots = () => dkOrder().filter((slot) => slot.skipped && !dkMadeAt(slot.pick));
let dkLate = null; // pick number of a skipped team making its late pick now
const dkActive = () => (dkLate && dkSkippedSlots().find((s) => s.pick === dkLate)) || dkOnClock();
const dkDrafted = () => {
  const ids = new Set(), names = new Set();
  for (const d of dkPicks()) { if (d.poolId) ids.add(d.poolId); names.add(normalizePlayerName(d.player)); }
  return (p) => ids.has(p.id) || names.has(normalizePlayerName(p.name));
};

function dkSave(change, message) {
  if (!dkCanSave) { dkStatus.textContent = "Saved league data couldn't be read, so nothing can be saved here."; return false; }
  const before = JSON.stringify(dkData);
  change(dkData);
  try {
    writeStoredOffice(dkData);
  } catch (error) {
    dkData = JSON.parse(before);
    dkStatus.textContent = /quota/i.test(`${error.name} ${error.message}`) ? "Browser storage is full, so that wasn't saved." : `Couldn't save: ${error.message}.`;
    return false;
  }
  if (message) dkStatus.textContent = message;
  dkRender();
  return true;
}

// ---------- Making a pick ----------
function dkMakePick(player) {
  const slot = dkActive();
  const late = Boolean(slot?.skipped);
  if (!slot) { dkStatus.textContent = dkOrder().length ? "Every pick has been made." : "Set the draft order under Draft setup first."; return; }
  const entry = { id: newRecordId("draft"), year: dkYear, round: slot.round, pick: slot.pick, teamId: slot.teamId, player: player.name.trim().slice(0, 70) };
  if (slot.compensatory) entry.compensatory = true;
  if (slot.fromTeam) entry.fromTeam = slot.fromTeam;
  if (player.position) entry.position = player.position.trim().toUpperCase().slice(0, 10);
  if (player.college) entry.college = player.college.trim().slice(0, 80);
  if (player.poolId) entry.poolId = player.poolId;
  entry.roundManual = true; // the round comes from the draft order
  entry.madeAt = new Date().toISOString(); // for Undo last pick, since a skipped team's pick comes later than its number
  const ok = dkSave((data) => {
    data.draftHistory = [...(data.draftHistory || []).filter((d) => !(d.year === dkYear && d.pick === slot.pick)), entry];
    data.draftLive = dkYear; // the first pick puts the draft ticker on every page
  },
    `${late ? "Late pick" : "Pick"} ${slot.pick}: the ${teamName(slot.teamId)} select ${entry.player}${entry.position ? `, ${entry.position}` : ""}${entry.college ? `, ${entry.college}` : ""}.`);
  if (!ok) return;
  dkFlashId = entry.id;
  dkPlayPickSound();
  if (late) dkLate = null; // the team on the clock keeps its time
  else dkTimerRestart();
  dkRender();
}

// Skip the team on the clock (also happens on its own when the pick clock runs out).
function dkSkip(auto) {
  const slot = dkOnClock();
  if (!slot) return;
  const ok = dkSave((data) => {
    const target = (data.draftOrder || []).find((d) => d.year === dkYear && d.pick === slot.pick);
    if (target) target.skipped = true;
  }, `${auto ? "Time's up: the" : "The"} ${teamName(slot.teamId)} ${auto ? "were" : "are"} skipped at pick ${slot.pick}. They can still pick at any time, from the players left.`);
  if (ok) dkTimerRestart(auto);
}
// Undo a skip: the team goes back to waiting for its turn at its own pick number.
function dkUnskip(slot) {
  dkSave((data) => {
    const target = (data.draftOrder || []).find((d) => d.year === dkYear && d.pick === slot.pick);
    if (target) delete target.skipped;
  }, `The ${teamName(slot.teamId)} are no longer skipped at pick ${slot.pick}.`);
  if (dkLate === slot.pick) dkLate = null;
  dkTimerRestart();
}

document.querySelector("#dk-own").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const f = form.elements;
  const slot = dkActive();
  if (!slot) { dkMakePick({ name: "" }); return; }
  if (!(await confirmAction(`${slot.skipped ? "Late pick" : "Pick"} ${slot.pick}: the ${teamName(slot.teamId)} select ${f.name.value.trim()}?`, { confirmLabel: "Make the pick" }))) return;
  dkMakePick({ name: f.name.value, position: f.position.value, college: f.college.value });
  form.reset();
});

document.querySelector("#dk-undo").addEventListener("click", async () => {
  const made = dkPicks().sort((a, b) => String(b.madeAt || "").localeCompare(String(a.madeAt || "")) || b.pick - a.pick)[0];
  if (!made) { dkStatus.textContent = "No picks to undo."; return; }
  if (!(await confirmAction(`Undo pick ${made.pick}, ${made.player} to the ${teamName(made.teamId)}? He goes back into the pool.`, { confirmLabel: "Undo pick", danger: true }))) return;
  const wasSkipped = dkOrder().find((s) => s.pick === made.pick)?.skipped;
  dkSave((data) => { data.draftHistory = data.draftHistory.filter((d) => d.id !== made.id); },
    `Pick ${made.pick} undone. The ${teamName(made.teamId)} are ${wasSkipped ? "back on the skipped list" : "back on the clock"}.`);
});

// ---------- On the clock ----------
function dkTeamBlock(slot, big) {
  const box = document.createElement("div");
  box.className = big ? "dk-team-big" : "dk-team-small";
  const team = nflTeams.find(({ id }) => id === slot.teamId);
  const logo = document.createElement("img");
  logo.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team.logo}.png`;
  logo.alt = "";
  logo.addEventListener("error", () => logo.remove(), { once: true });
  const text = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = big ? team.name : slot.teamId;
  text.append(name);
  if (slot.fromTeam) {
    const via = document.createElement("small");
    via.textContent = big ? `Pick from the ${teamName(slot.fromTeam)}` : `from ${slot.fromTeam}`;
    text.append(via);
  }
  box.append(logo, text);
  return box;
}

function dkRenderClock() {
  const slot = dkActive();
  const late = Boolean(slot?.skipped);
  const order = dkOrder();
  const clock = document.querySelector("#dk-clock");
  const label = document.querySelector("#dk-clock-label");
  const teamBox = document.querySelector("#dk-clock-team");
  const pickText = document.querySelector("#dk-clock-pick");
  clock.classList.toggle("is-done", !slot);
  if (!order.length) {
    label.textContent = "DRAFT ORDER NOT SET";
    teamBox.replaceChildren(Object.assign(document.createElement("p"), { className: "dk-clock-note", textContent: "Open Draft setup below, paste the order and add players to the Draft Pool." }));
    pickText.textContent = "";
    document.querySelector("#dk-next").replaceChildren();
    clock.style.removeProperty("--dk-team");
    return;
  }
  dkRenderSkipped();
  if (!slot) {
    const waiting = dkSkippedSlots().length;
    label.textContent = waiting ? "WAITING ON SKIPPED TEAMS" : "DRAFT COMPLETE";
    teamBox.replaceChildren(Object.assign(document.createElement("p"), { className: "dk-clock-note",
      textContent: waiting ? `Every other pick is in. ${waiting} skipped team${waiting === 1 ? " still has" : "s still have"} a pick to make (below).` : `All ${order.length} picks are in.` }));
    pickText.textContent = "";
    document.querySelector("#dk-next").replaceChildren();
    clock.style.removeProperty("--dk-team");
    dkTimerStop();
    return;
  }
  label.textContent = late ? "LATE PICK · SKIPPED TEAM" : "ON THE CLOCK";
  document.querySelector("#dk-timer-for").textContent = late && dkOnClock() ? `${dkOnClock().teamId}'s clock keeps running` : "";
  clock.classList.toggle("is-late-pick", late);
  teamBox.replaceChildren(dkTeamBlock(slot, true));
  pickText.textContent = `Round ${slot.round} · Pick ${slot.pick}${slot.compensatory ? " (compensatory)" : ""}${late && dkOnClock() ? ` · then back to the ${teamName(dkOnClock().teamId)}` : ""}`;
  if (late) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "workspace-button dk-late-cancel";
    back.textContent = "Cancel late pick";
    back.addEventListener("click", () => { dkLate = null; dkRender(); });
    pickText.append(" ", back);
  }
  const palette = typeof teamThemePalettes === "object" ? teamThemePalettes[slot.teamId] : null;
  if (palette) clock.style.setProperty("--dk-team", palette[0]); else clock.style.removeProperty("--dk-team");
  const current = dkOnClock() || slot;
  const upcoming = order.filter((s) => s.pick > current.pick && !dkMadeAt(s.pick) && !s.skipped).slice(0, 4);
  const next = document.querySelector("#dk-next");
  const title = Object.assign(document.createElement("span"), { className: "dk-next-title", textContent: "UP NEXT" });
  next.replaceChildren(title, ...upcoming.map((s) => {
    const row = document.createElement("div");
    row.className = "dk-next-row";
    row.append(Object.assign(document.createElement("span"), { className: "dk-next-pick", textContent: `${s.pick}${s.compensatory ? "*" : ""}` }), dkTeamBlock(s, false));
    return row;
  }));
}

// Skipped teams that can still pick, under the clock.
function dkRenderSkipped() {
  const box = document.querySelector("#dk-skipped");
  const list = dkSkippedSlots();
  box.hidden = !list.length;
  box.querySelector(".dk-skipped-list").replaceChildren(...list.map((s) => {
    const row = document.createElement("div");
    row.className = `dk-skipped-row${dkLate === s.pick ? " is-active" : ""}`;
    row.append(Object.assign(document.createElement("span"), { className: "dk-next-pick", textContent: `${s.pick}${s.compensatory ? "*" : ""}` }), dkTeamBlock(s, false));
    const go = document.createElement("button");
    go.type = "button";
    go.className = "button button-lime dk-draft-btn";
    go.textContent = dkLate === s.pick ? "Picking now" : "Make pick";
    go.disabled = dkLate === s.pick || !dkCanSave;
    go.addEventListener("click", () => { dkLate = s.pick; dkRender(); dkStatus.textContent = `The ${teamName(s.teamId)} are making their late pick ${s.pick}. Choose from the players left in the pool.`; });
    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "workspace-button dk-unskip";
    undo.textContent = "Undo skip";
    undo.title = "Put this team back in the order at its own pick";
    undo.addEventListener("click", async () => {
      if (await confirmAction(`Undo the skip for the ${teamName(s.teamId)} at pick ${s.pick}?`, { confirmLabel: "Undo skip" })) dkUnskip(s);
    });
    row.append(go, undo);
    return row;
  }));
}

// ---------- Draft Pool ----------
// A prospect's name, linked to his profile (player.html) when he's in the Draft Pool.
function dkProfileName(text, poolId, tag = "span") {
  const el = document.createElement(tag);
  const prospect = poolId ? (dkData.draftPool || []).find((p) => p.id === poolId) : null;
  if (!prospect) { el.textContent = text; return el; }
  const a = Object.assign(document.createElement("a"), { className: "dk-profile-link", href: profileUrl(prospect.id), textContent: text, title: `${text}: player profile` });
  el.append(a);
  return el;
}
function dkPoolIdFor(pick) {
  if (pick.poolId) return pick.poolId;
  const key = normalizePlayerName(pick.player);
  return (dkData.draftPool || []).find((p) => p.year === pick.year && normalizePlayerName(p.name) === key)?.id || null;
}

function dkRenderPool() {
  const drafted = dkDrafted();
  const query = document.querySelector("#dk-pool-search").value.trim().toLowerCase();
  const pos = document.querySelector("#dk-pool-pos").value;
  const pool = dkPool();
  const available = pool.filter((p) => !drafted(p));
  // Position filter options
  const posSelect = document.querySelector("#dk-pool-pos");
  const keep = posSelect.value;
  posSelect.replaceChildren(new Option("All", ""), ...[...new Set(available.map((p) => p.position).filter(Boolean))].sort().map((p) => new Option(p, p)));
  posSelect.value = [...posSelect.options].some((o) => o.value === keep) ? keep : "";
  const shown = available.filter((p) => (!posSelect.value || p.position === posSelect.value) &&
    (!query || `${p.name} ${p.college || ""}`.toLowerCase().includes(query)))
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name));
  document.querySelector("#dk-pool-count").textContent = String(available.length);
  const slot = dkActive();
  document.querySelector("#dk-pool-rows").replaceChildren(...shown.slice(0, 400).map((p) => {
    const tr = document.createElement("tr");
    tr.insertCell().textContent = p.rank ?? "";
    const name = tr.insertCell();
    name.className = "dk-pool-name";
    name.append(playerPortrait(p), Object.assign(document.createElement("a"), { className: "dk-profile-link", href: profileUrl(p.id), textContent: p.name, title: `${p.name}: player profile` }));
    tr.insertCell().textContent = p.position || "";
    tr.insertCell().textContent = p.college || "";
    const cell = tr.insertCell();
    const b = document.createElement("button");
    b.type = "button";
    b.className = "button button-lime dk-draft-btn";
    b.textContent = "Draft";
    b.disabled = !slot || !dkCanSave;
    b.title = slot ? `Draft ${p.name} for the ${teamName(slot.teamId)}` : "No team on the clock";
    b.addEventListener("click", async () => {
      const now = dkActive();
      if (!now) return;
      if (!(await confirmAction(`${now.skipped ? "Late pick" : "Pick"} ${now.pick}: the ${teamName(now.teamId)} select ${p.name}${p.position ? `, ${p.position}` : ""}${p.college ? `, ${p.college}` : ""}?`, { confirmLabel: "Make the pick" }))) return;
      dkMakePick({ name: p.name, position: p.position, college: p.college, poolId: p.id });
    });
    cell.append(b);
    return tr;
  }));
  const empty = document.querySelector("#dk-pool-empty");
  empty.hidden = shown.length > 0;
  empty.textContent = !pool.length ? "The Draft Pool is empty. Add prospects under Draft setup, or type a player into the form below."
    : available.length ? "No prospects match." : "Every prospect in the pool has been drafted.";
  document.querySelector("#dk-own-submit").disabled = !slot || !dkCanSave;
}

// ---------- The board ----------
// The board follows the pick on the clock: when it changes, the board switches to that pick's round and scrolls (inside
// the list, not the page) so that pick sits near the top with the previous pick just above it.
let dkFollowPick = null;
function dkFollowCurrent(board, slot) {
  const key = slot ? `${slot.year ?? ""}-${slot.pick}` : null;
  if (!key || key === dkFollowPick) return;
  const now = board.querySelector(".dk-slot.is-now");
  if (!now) return;
  dkFollowPick = key;
  const target = now.previousElementSibling || now;
  const top = board.scrollTop + target.getBoundingClientRect().top - board.getBoundingClientRect().top;
  board.scrollTo({ top: Math.max(0, top), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function dkRenderBoard() {
  const order = dkOrder();
  const slot = dkOnClock();
  // A new pick on the clock brings the board back to the current round.
  if (slot && `${slot.year ?? ""}-${slot.pick}` !== dkFollowPick) dkRound = 0;
  const made = dkPicks();
  document.querySelector("#dk-made").textContent = String(made.length);
  document.querySelector("#dk-total").textContent = String(order.length);
  const rounds = [...new Set(order.map((s) => s.round))].sort((a, b) => a - b);
  const showing = dkRound && rounds.includes(dkRound) ? dkRound : slot?.round || rounds[rounds.length - 1] || 1;
  document.querySelector("#dk-rounds").replaceChildren(...rounds.map((r) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `season-tab${r === showing ? " is-active" : ""}`;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(r === showing));
    b.textContent = `Rd ${r}`;
    b.addEventListener("click", () => { dkRound = r; dkRenderBoard(); });
    return b;
  }));
  document.querySelector("#dk-board").replaceChildren(...order.filter((s) => s.round === showing).map((s) => {
    const li = document.createElement("li");
    const pick = dkMadeAt(s.pick);
    li.className = `dk-slot${pick ? " is-made" : ""}${slot && s.pick === slot.pick ? " is-now" : ""}${s.skipped && !pick ? " is-skipped" : ""}`;
    li.append(Object.assign(document.createElement("span"), { className: "dk-slot-pick", textContent: `${s.pick}${s.compensatory ? "*" : ""}` }), dkTeamBlock(s, false));
    const who = document.createElement("span");
    who.className = "dk-slot-player";
    if (pick) {
      who.append(dkProfileName(pick.player, dkPoolIdFor(pick), "strong"), [pick.position, pick.college].filter(Boolean).join(" · "));
      if (s.skipped) who.append(Object.assign(document.createElement("em"), { textContent: "Late pick (was skipped)" }));
    } else who.textContent = s.skipped ? "Skipped · can still pick" : slot && s.pick === slot.pick ? "On the clock" : "";
    li.append(who);
    return li;
  }));
  dkFollowCurrent(document.querySelector("#dk-board"), slot);
}

// Under Last Player Selected: the same team's other picks in this draft (not the one just made), two at a time,
// moving on to the next two every 15 seconds. A team with only one other pick shows just that one.
let dkMoreTimer = null, dkMoreFor = null, dkMorePage = 0;
function dkRenderMore(box, last) {
  const others = dkPicks().filter((d) => d.teamId === last.teamId && d.id !== last.id).sort((a, b) => a.pick - b.pick);
  if (dkMoreFor !== last.id) { dkMoreFor = last.id; dkMorePage = 0; }
  clearInterval(dkMoreTimer);
  dkMoreTimer = null;
  if (!others.length) return;
  const pages = Math.ceil(others.length / 2);
  const more = document.createElement("div");
  more.className = "dk-last-more";
  const label = Object.assign(document.createElement("span"), { className: "dk-last-more-label" });
  const list = Object.assign(document.createElement("div"), { className: "dk-last-more-list" });
  const dots = Object.assign(document.createElement("span"), { className: "dk-last-more-dots" });
  more.append(label, list, dots);
  box.append(more);
  const show = () => {
    const page = dkMorePage % pages;
    label.textContent = `ALSO DRAFTED BY THE ${teamName(last.teamId).split(" ").pop().toUpperCase()}`;
    list.replaceChildren(...others.slice(page * 2, page * 2 + 2).map((d) => {
      const item = Object.assign(document.createElement("div"), { className: "dk-last-more-item" });
      item.append(Object.assign(document.createElement("span"), { textContent: `RD ${d.round} · PK ${d.pick}${d.compensatory ? "*" : ""}` }),
        Object.assign(document.createElement("strong"), { textContent: d.player }),
        Object.assign(document.createElement("small"), { textContent: [d.position, d.college].filter(Boolean).join(" · ") }));
      return item;
    }));
    list.classList.remove("is-in");
    void list.offsetWidth;
    list.classList.add("is-in");
    dots.replaceChildren(...(pages > 1 ? Array.from({ length: pages }, (_, i) => Object.assign(document.createElement("i"), { className: i === page ? "is-on" : "" })) : []));
  };
  show();
  if (pages > 1) dkMoreTimer = setInterval(() => { dkMorePage += 1; show(); }, 15000);
}

// College stats on Last Player Selected, from ESPN (no key needed). The player is found with ESPN's search, then his
// last college season (the year before the draft; the season before that if it has nothing) is read from his ESPN
// stats page data. Results are cached in this browser. Linemen and players ESPN has no stats for show nothing.
const dkStatsCacheKey = "nbf-college-stats-espn";
const dkStatPlan = { // ESPN category → [stat name, label], in display order
  passing: [["completions", "CMP"], ["passingAttempts", "ATT"], ["passingYards", "PASS YDS"], ["passingTouchdowns", "PASS TD"], ["interceptions", "INT"]],
  rushing: [["rushingAttempts", "CAR"], ["rushingYards", "RUSH YDS"], ["rushingTouchdowns", "RUSH TD"], ["yardsPerRushAttempt", "YPC"]],
  receiving: [["receptions", "REC"], ["receivingYards", "REC YDS"], ["receivingTouchdowns", "REC TD"], ["yardsPerReception", "YPR"]],
  defensive: [["totalTackles", "TKL"], ["tacklesForLoss", "TFL"], ["sacks", "SACKS"], ["passesDefended", "PD"]],
  defensiveInterceptions: [["interceptions", "INT"], ["interceptionYards", "INT YDS"], ["interceptionTouchdowns", "PICK-6"]],
  kicking: [["fieldGoalsMade", "FGM"], ["fieldGoalAttempts", "FGA"], ["longFieldGoalMade", "LONG"], ["extraPointsMade", "XPM"]],
  punting: [["punts", "PUNTS"], ["grossAvgPuntYards", "AVG"], ["longPunt", "LONG"], ["puntsInside20", "IN 20"]],
};
const dkDef = ["defensive", "defensiveInterceptions"];
const dkPosCats = {
  QB: ["passing", "rushing"], RB: ["rushing", "receiving"], FB: ["rushing", "receiving"], WR: ["receiving", "rushing"], TE: ["receiving"],
  K: ["kicking"], PK: ["kicking"], P: ["punting"], DL: dkDef, DE: dkDef, DT: dkDef, NT: dkDef, EDGE: dkDef, LB: dkDef, ILB: dkDef, OLB: dkDef,
  MLB: dkDef, CB: dkDef, S: dkDef, DB: dkDef, FS: dkDef, SS: dkDef,
};
const dkStatsMemory = {};
function dkStatsCache() { try { return { ...dkStatsMemory, ...(JSON.parse(localStorage.getItem(dkStatsCacheKey)) || {}) }; } catch { return { ...dkStatsMemory }; } }
function dkStatsSave(key, value) {
  dkStatsMemory[key] = value;
  const cache = dkStatsCache();
  cache[key] = value;
  const keys = Object.keys(cache);
  if (keys.length > 400) keys.sort((a, b) => (cache[a].at || 0) - (cache[b].at || 0)).slice(0, keys.length - 400).forEach((k) => delete cache[k]);
  try { localStorage.setItem(dkStatsCacheKey, JSON.stringify(cache)); } catch { /* fine without the cache */ }
}
const dkNameKey = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const dkSchoolKey = (s) => String(s || "").toLowerCase().replace(/\bst\.?(?=\s|$)/g, "state").replace(/\buniversity( of)?\b/g, "").replace(/[^a-z]/g, "");
async function dkEspn(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}
// Every college football player in an ESPN search response, wherever it sits: [{ id, name, text }].
function dkEspnPlayers(json) {
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const name = node.displayName || node.name;
    const uid = String(node.uid || "");
    const flat = JSON.stringify(node);
    // College (league 23), or NFL (league 28) once he's been drafted: ESPN keeps the same athlete id, so his college
    // stats are still under that id.
    const cfb = /~l:2[38]~/.test(`${uid}~`) || /college-football/.test(`${node.league || ""} ${node.defaultLeagueSlug || ""} ${node.link?.web || node.link || ""} ${uid}`) ||
      (/^s:20~/.test(uid) && /\bnfl\b/.test(`${node.defaultLeagueSlug || ""} ${node.link?.web || ""}`));
    const id = (uid.match(/~a:(\d+)/) || [])[1] || (/^\d+$/.test(String(node.id || "")) && /a:|athlete|player/i.test(`${uid} ${node.type || ""}`) ? String(node.id) : "");
    if (typeof name === "string" && id && cfb) out.push({ id, name, text: flat });
    else Object.values(node).forEach(walk);
  };
  walk(json);
  return out;
}
// ESPN's season table (athlete stats page): categories[] with names[] and statistics[] { season: { year }, stats[] }.
function dkSeasonFromTable(json, season) {
  const cats = {};
  let team = "";
  (json?.categories || []).forEach((c) => {
    const names = c.names || [];
    const rows = (c.statistics || []).filter((r) => Number(r.season?.year) === season);
    const row = rows[rows.length - 1];
    if (!row || !names.length) return;
    team ||= row.teamSlug || row.teamName || "";
    const key = c.name === "defensive" || c.name === "defense" ? "defensive" : c.name;
    names.forEach((n, i) => { if (row.stats?.[i] !== undefined && row.stats[i] !== "") (cats[key] ||= {})[n] = String(row.stats[i]); });
  });
  return { cats, team };
}
// ESPN's core API: splits.categories[] { name, stats[] { name, displayValue } } for one season and season type.
function dkSeasonFromCore(json) {
  const cats = {};
  (json?.splits?.categories || []).forEach((c) => (c.stats || []).forEach((s) => {
    if (s.displayValue !== undefined && Number(s.value) !== 0) (cats[c.name] ||= {})[s.name] = String(s.displayValue);
  }));
  return cats;
}
async function dkFetchCollegeStats(pick) {
  const want = dkNameKey(pick.player);
  const school = dkSchoolKey(pick.college);
  const q = encodeURIComponent(pick.player);
  let found = [], reached = false;
  for (const url of [
    `https://site.web.api.espn.com/apis/search/v2?query=${q}&limit=25`,
    `https://site.web.api.espn.com/apis/common/v3/search?query=${q}&limit=25&type=player&sport=football&league=college-football`,
  ]) {
    try { found = dkEspnPlayers(await dkEspn(url)).filter((p) => dkNameKey(p.name) === want); reached = true; } catch { found = []; }
    if (found.length) break;
  }
  if (!reached) throw new Error("ESPN couldn't be reached");
  const ids = [...new Set([...found.filter((p) => school && dkSchoolKey(p.text).includes(school)), ...found].map((p) => p.id))].slice(0, 3);
  for (const id of ids) {
    let table = null;
    try { table = await dkEspn(`https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/${id}/stats`); } catch { /* try the core API */ }
    for (const season of [pick.year - 1, pick.year - 2]) {
      let { cats } = table ? dkSeasonFromTable(table, season) : { cats: {} };
      if (!Object.keys(cats).length) {
        try { cats = dkSeasonFromCore(await dkEspn(`https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${season}/types/2/athletes/${id}/statistics`)); } catch { cats = {}; }
      }
      if (Object.keys(cats).some((c) => dkStatPlan[c])) return { season, team: pick.college || "", cats, at: Date.now() };
    }
  }
  return { none: true, at: Date.now() };
}
const dkNum = (v) => { const n = Number(String(v).replace(/,/g, "")); return Number.isInteger(n) && Math.abs(n) >= 1000 ? n.toLocaleString("en-US") : v; };
function dkStatItems(stats, position) {
  const cats = stats.cats || {};
  const order = [...(dkPosCats[String(position || "").toUpperCase()] || []), ...Object.keys(dkStatPlan)];
  const items = [];
  [...new Set(order)].filter((c) => cats[c] && dkStatPlan[c]).slice(0, 2).forEach((c) => {
    dkStatPlan[c].forEach(([stat, label]) => {
      const v = cats[c][stat];
      if (v === undefined || v === "" || (c === "rushing" && /WR/i.test(position || "") && Number(cats[c].rushingAttempts) < 10)) return;
      if (!items.some((i) => i.label === label)) items.push({ label, value: dkNum(v) });
    });
  });
  return items.slice(0, 9);
}
const dkStatsLoading = new Set();
// Stats typed in by hand ("3,535 PASS YDS, 41 PASS TD, 6 INT") → [{ value, label }].
function dkParseStatLine(text) {
  return String(text || "").split(/,(?!\d)|[;·|\n]+/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^([\d.,%-]+)\s+(.+)$/) || part.match(/^(.+?)\s+([\d.,%-]+)$/);
    if (!m) return { value: part, label: "" };
    return /^[\d.,%-]+$/.test(m[1]) ? { value: m[1], label: m[2].toUpperCase() } : { value: m[2], label: m[1].toUpperCase() };
  }).slice(0, 10);
}
const dkStatsEl = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text !== undefined ? { textContent: text } : {});
let dkStatsEditing = null;
// The college stats section of Last Player Selected. It's always there for the last pick: the stats (typed in for
// the pick, or found on ESPN), "Loading…", or a note that ESPN had nothing with Try again and Enter stats.
function dkRenderStats(box, last) {
  if (!last.player) return;
  const cacheKey = `${last.year}|${dkNameKey(last.player)}|${dkSchoolKey(last.college)}`;
  const cached = dkStatsCache()[cacheKey];
  const row = dkStatsEl("div", "dk-last-stats");
  box.append(row);
  const edit = () => { dkStatsEditing = last.id; dkRenderLast(); };
  if (dkStatsEditing === last.id) {
    row.classList.add("is-edit");
    const form = dkStatsEl("form", "dk-last-stats-form");
    const input = dkStatsEl("input");
    input.maxLength = 200;
    input.placeholder = "e.g. 3,535 PASS YDS, 41 PASS TD, 6 INT";
    input.value = last.collegeStats || (cached && !cached.none ? dkStatItems(cached, last.position).map((i) => `${i.value} ${i.label}`).join(", ") : "");
    input.setAttribute("aria-label", `College stats for ${last.player}`);
    const save = dkStatsEl("button", "button button-lime", "Save stats");
    save.type = "submit";
    const cancel = dkStatsEl("button", "workspace-button", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => { dkStatsEditing = null; dkRenderLast(); });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim().slice(0, 200);
      dkStatsEditing = null;
      dkSave((data) => {
        const pick = (data.draftHistory || []).find((d) => d.id === last.id);
        if (!pick) return;
        if (value) pick.collegeStats = value; else delete pick.collegeStats;
      }, value ? `College stats saved for ${last.player}.` : `Typed-in stats removed for ${last.player}.`);
    });
    form.append(dkStatsEl("span", "dk-last-stats-label", "COLLEGE STATS"), input, save, cancel);
    row.append(form);
    setTimeout(() => input.focus(), 0);
    return;
  }
  const manual = last.collegeStats ? dkParseStatLine(last.collegeStats) : null;
  const items = manual || (cached && !cached.none ? dkStatItems(cached, last.position) : []);
  if (items.length) {
    row.append(dkStatsEl("span", "dk-last-stats-label", manual ? `${last.year - 1} SEASON${last.college ? ` · ${last.college.toUpperCase()}` : ""}` : `${cached.season} SEASON${cached.team ? ` · ${String(cached.team).toUpperCase()}` : ""}`));
    const list = dkStatsEl("div", "dk-last-stats-list");
    list.append(...items.map(({ label, value }) => {
      const cell = document.createElement("div");
      cell.append(dkStatsEl("strong", "", value), dkStatsEl("span", "", label));
      return cell;
    }));
    const side = dkStatsEl("div", "dk-last-stats-side");
    const editBtn = dkStatsEl("button", "dk-last-stats-btn", "Edit");
    editBtn.type = "button";
    editBtn.addEventListener("click", edit);
    side.append(dkStatsEl("small", "dk-last-stats-src", manual ? "Entered by hand" : "ESPN"), editBtn);
    row.append(list, side);
    return;
  }
  const loading = dkStatsLoading.has(cacheKey);
  const failed = cached?.none && !loading;
  row.append(dkStatsEl("span", "dk-last-stats-label", "COLLEGE STATS"));
  row.append(dkStatsEl("span", "dk-last-stats-note", failed
    ? (cached.error ? `Couldn't reach ESPN for ${last.player}'s stats.` : `ESPN has no college stats for ${last.player}${/^(OL|OT|OG|G|T|C|IOL|LS)$/i.test(last.position || "") ? " (linemen don't have any)" : ""}.`)
    : "Loading college stats from ESPN…"));
  const side = dkStatsEl("div", "dk-last-stats-side");
  if (failed) {
    const retry = dkStatsEl("button", "dk-last-stats-btn", "Try again");
    retry.type = "button";
    retry.addEventListener("click", () => { delete dkStatsMemory[cacheKey]; dkRenderLast(); });
    side.append(retry);
  }
  const enter = dkStatsEl("button", "dk-last-stats-btn", "Enter stats");
  enter.type = "button";
  enter.addEventListener("click", edit);
  side.append(enter);
  row.append(side);
  if (failed || loading) return;
  dkStatsLoading.add(cacheKey);
  dkFetchCollegeStats(last)
    .then((stats) => (stats.none ? (dkStatsMemory[cacheKey] = stats) : dkStatsSave(cacheKey, stats)))
    .catch(() => { dkStatsMemory[cacheKey] = { none: true, error: true, at: Date.now() }; })
    .finally(() => { dkStatsLoading.delete(cacheKey); dkRenderLast(); });
}

// The player's combine results (pasted under Draft setup), under his college stats.
function dkRenderCombine(box, last) {
  const c = dkCombineFor(last.player, last.year);
  if (!c) return;
  const items = Object.keys(dkCombineLabels).filter((k) => c[k]).map((k) => ({ label: dkCombineLabels[k], value: c[k] }));
  if (!items.length) return;
  const row = dkStatsEl("div", "dk-last-stats is-combine");
  row.append(dkStatsEl("span", "dk-last-stats-label", `${last.year} NFL COMBINE`));
  const list = dkStatsEl("div", "dk-last-stats-list");
  list.append(...items.map(({ label, value }) => {
    const cell = document.createElement("div");
    cell.append(dkStatsEl("strong", "", value), dkStatsEl("span", "", label));
    return cell;
  }));
  const side = dkStatsEl("div", "dk-last-stats-side");
  side.append(dkStatsEl("small", "dk-last-stats-src", c.source || "Entered by hand"));
  row.append(list, side);
  box.append(row);
}

// "Last Player Selected": the most recent pick, across the top; it flashes when a pick is made on this screen.
let dkFlashId = null;
function dkRenderLast() {
  const box = document.querySelector("#dk-last");
  const last = dkPicks().sort((a, b) => String(b.madeAt || "").localeCompare(String(a.madeAt || "")) || b.pick - a.pick)[0];
  box.hidden = !last;
  if (!last) return;
  const team = nflTeams.find(({ id }) => id === last.teamId);
  box.style.setProperty("--dk-team", typeof teamThemePalettes === "object" && teamThemePalettes[last.teamId] ? teamThemePalettes[last.teamId][0] : "#0c2b50");
  const logo = document.createElement("div"); // keeps its column even if the logo can't load
  logo.className = "dk-last-logo";
  const img = document.createElement("img");
  img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team.logo}.png`;
  img.alt = "";
  img.addEventListener("error", () => { img.remove(); if (!logo.querySelector(".dk-last-headshot")) logo.textContent = team.id; }, { once: true });
  logo.append(img);
  // The prospect's headshot (Admin › Player Headshots, or set on his profile), with the team logo as a badge.
  const prospect = (dkData.draftPool || []).find((p) => p.id === dkPoolIdFor(last));
  const photo = prospect ? profilePhotoSrc(playerProfile(prospect)) : "";
  if (photo) {
    const shot = Object.assign(document.createElement("img"), { className: "dk-last-headshot", src: photo, alt: "" });
    shot.addEventListener("error", () => { shot.remove(); logo.classList.remove("has-photo"); }, { once: true });
    logo.classList.add("has-photo");
    logo.prepend(shot);
  }
  const text = document.createElement("div");
  text.className = "dk-last-text";
  const label = Object.assign(document.createElement("span"), { className: "dk-last-label", textContent: "LAST PLAYER SELECTED" });
  const name = dkProfileName(last.player, dkPoolIdFor(last), "strong");
  name.className = "dk-last-name";
  const meta = Object.assign(document.createElement("span"), { className: "dk-last-meta",
    textContent: [last.position, last.college].filter(Boolean).join(" · ") });
  text.append(label, name, meta);
  const pick = document.createElement("div");
  pick.className = "dk-last-pick";
  pick.append(Object.assign(document.createElement("span"), { textContent: `RD ${last.round} · PICK ${last.pick}${last.compensatory ? "*" : ""}` }),
    Object.assign(document.createElement("strong"), { textContent: team.name }),
    Object.assign(document.createElement("small"), { textContent: last.fromTeam ? `Pick from the ${teamName(last.fromTeam)}` : "" }));
  box.replaceChildren(logo, text, pick);
  dkRenderStats(box, last);
  dkRenderCombine(box, last);
  dkRenderMore(box, last);
  if (dkFlashId === last.id) {
    dkFlashId = null;
    box.classList.remove("is-flash");
    void box.offsetWidth; // restart the animation
    box.classList.add("is-flash");
  }
}

function dkRenderLive() {
  const live = dkData.draftLive === dkYear;
  const button = document.querySelector("#dk-live");
  button.textContent = live ? "End draft (hide ticker)" : "Start draft (show ticker)";
  button.classList.toggle("is-live", live);
  button.disabled = !dkCanSave || (!live && !dkOrder().length);
  if (typeof renderDraftTicker === "function") renderDraftTicker();
}

function dkRender() {
  if (typeof dkFillTradeForm === "function" && document.querySelector("#dk-trade-to")) dkFillTradeForm();
  dkRenderLive();
  dkRenderLast();
  document.querySelector("#dk-title").textContent = `${dkYear} Draft`;
  document.title = `${dkYear} Draft — Nothing But NFL`;
  dkRenderClock();
  dkRenderPool();
  dkRenderBoard();
}
document.querySelector("#dk-pool-search").addEventListener("input", dkRenderPool);
document.querySelector("#dk-pool-pos").addEventListener("change", dkRenderPool);

// ---------- Pick clock (this screen only) ----------
let dkTimerLeft = 300, dkTimerHandle = null;
const dkTimerEl = document.querySelector("#dk-timer");
const dkTimerLength = () => Number(document.querySelector("#dk-timer-length").value);
// Mirror the pick clock for the draft ticker on other pages and tabs.
function dkClockShare() {
  try { localStorage.setItem("nbf-draft-clock", JSON.stringify({ year: dkYear, pick: dkOnClock()?.pick ?? null, left: dkTimerLeft, running: dkTimerHandle !== null, at: Date.now() })); } catch { /* fine */ }
}
function dkTimerShow() {
  dkClockShare();
  const m = Math.floor(Math.max(0, dkTimerLeft) / 60), s = Math.max(0, dkTimerLeft) % 60;
  dkTimerEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
  document.querySelector("#dk-clock").classList.toggle("is-late", dkTimerLeft <= 30 && dkTimerHandle !== null);
  document.querySelector("#dk-clock").classList.toggle("is-expired", dkTimerLeft <= 0);
  document.querySelector("#dk-timer-toggle").textContent = dkTimerHandle ? "Pause clock" : "Start clock";
}
function dkTimerStop() { clearInterval(dkTimerHandle); dkTimerHandle = null; dkSoundStop(); dkTimerShow(); }
function dkTimerStart() {
  if (dkTimerHandle || !dkOnClock()) return;
  dkTimerHandle = setInterval(() => {
    dkTimerLeft -= 1;
    dkSoundTick(dkTimerLeft);
    if (dkTimerLeft <= 0) { dkTimerLeft = 0; clearInterval(dkTimerHandle); dkTimerHandle = null; dkTimerShow(); dkSkip(true); return; }
    dkTimerShow();
  }, 1000);
  dkTimerShow();
}
function dkTimerRestart(keepRunning = false) { const running = keepRunning || dkTimerHandle !== null; dkTimerStop(); dkTimerLeft = dkTimerLength(); if (running) dkTimerStart(); dkTimerShow(); }
document.querySelector("#dk-timer-toggle").addEventListener("click", () => (dkTimerHandle ? dkTimerStop() : dkTimerStart()));
document.querySelector("#dk-skip").addEventListener("click", async () => {
  const slot = dkOnClock();
  if (!slot) return;
  if (await confirmAction(`Skip the ${teamName(slot.teamId)} at pick ${slot.pick}? They can still pick later from the players left.`, { confirmLabel: "Skip team" })) dkSkip(false);
});
document.querySelector("#dk-timer-reset").addEventListener("click", () => { dkTimerStop(); dkTimerLeft = dkTimerLength(); dkTimerShow(); });
document.querySelector("#dk-timer-length").addEventListener("change", () => { dkTimerLeft = dkTimerLength(); dkTimerShow(); });

// ---------- Draft setup: order ----------
const dkSkipped = (errors) => {
  const box = document.querySelector("#dk-order-skipped");
  box.hidden = !errors.length;
  box.querySelector("summary").textContent = `${errors.length} line${errors.length === 1 ? "" : "s"} skipped`;
  box.querySelector("ul").replaceChildren(...errors.map((e) => Object.assign(document.createElement("li"), { textContent: `Line ${e.line}: ${e.why}. ${e.text}` })));
  if (errors.length) box.open = true;
};

// Reads the draft order in any of these forms. Returns { slots, errors }; slots from a pick sheet carry their round.
//   Current, Round, Original, Pick Number  (the league's draft picks sheet: "CHI, 1, CAR, 1" — Pick Number can be the
//                                           overall pick or the pick within the round; a * on the round marks a comp pick)
//   Pick, Team (from team)                 ("1, Chicago Bears (CAR)")
//   just team names, one per line, in order
function dkParseOrder(text) {
  const slots = [], errors = [];
  let n = 0;
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || /^(round|rnd|rd|pick|team|current|owner)\b[^\d]*$/i.test(t) || /^round\s+\d+\s*[-–:]?\s*$/i.test(t)) return;
    const cells = drSplit(t) || t.split(/\s+(?=\D)/);
    const sheetCells = (drSplit(t) || t.split(/\s+/)).filter((c) => c !== "");
    // A * on the round (or the pick) marks a compensatory pick in that round: "BAL, 3*, BAL, 97".
    if (sheetCells.length >= 4 && /^\d{1,2}\s*\*?$/.test(sheetCells[1]) && drTeamToken(sheetCells[0]) && drTeamToken(sheetCells[2]) && drPickToken(sheetCells[3])) {
      const teamId = drTeamToken(sheetCells[0]), original = drTeamToken(sheetCells[2]), pick = drPickToken(sheetCells[3]);
      slots.push({ round: Number.parseInt(sheetCells[1], 10), pick: pick.pick, compensatory: pick.compensatory || /\*/.test(sheetCells[1]), teamId, fromTeam: original !== teamId ? original : undefined });
      return;
    }
    let pick = drPickToken(cells[0]);
    let teamText = pick ? cells.slice(1).join(" ") : t;
    if (!pick) pick = { pick: n + 1, compensatory: /\*/.test(t) };
    const teamId = drTeamToken(teamText.replace(/^[.)\-–\s]+/, ""));
    if (!teamId) { errors.push({ line: i + 1, why: "team not recognised", text: t.slice(0, 80) }); return; }
    n = pick.pick;
    const from = drFromToken(teamText);
    slots.push({ pick: pick.pick, compensatory: pick.compensatory, teamId, fromTeam: from && from !== teamId ? from : undefined });
  });
  return { slots, errors };
}

// Teams in first-round order → every round, with each pick's owner from Draft Pick Manager (data.picks). With
// fromManager, round 1 owners come from the manager too (the pasted list is just the order of the original teams).
function dkExpandOrder(firstRound, fromManager = false) {
  const picks = (dkData.picks || []).filter((p) => p.year === dkYear);
  const rounds = Math.max(7, ...picks.map((p) => p.round));
  const out = [];
  let number = 0;
  for (let round = 1; round <= rounds; round += 1) {
    for (const s of firstRound) {
      const original = s.fromTeam || s.teamId; // whose pick it originally was
      const asset = picks.find((p) => p.round === round && p.originalTeam === original && !p.compensatory);
      if (fromManager && picks.length && !asset) continue; // a pick that's no longer in the manager (forfeited)
      const owner = round === 1 && !fromManager ? s.teamId : asset?.currentOwner || original;
      out.push({ year: dkYear, pick: ++number, round, teamId: owner, ...(owner !== original ? { fromTeam: original } : {}), ...(asset ? { pickId: asset.id } : {}) });
    }
    // Compensatory picks for this round go at the end of it.
    for (const c of picks.filter((p) => p.round === round && p.compensatory)) {
      out.push({ year: dkYear, pick: ++number, round, teamId: c.currentOwner, compensatory: true, pickId: c.id, ...(c.currentOwner !== c.originalTeam ? { fromTeam: c.originalTeam } : {}) });
    }
  }
  return out;
}

document.querySelector("#dk-order-save").addEventListener("click", async () => {
  const { slots, errors } = dkParseOrder(document.querySelector("#dk-order-text").value);
  dkSkipped(errors);
  if (!slots.length) { dkStatus.textContent = "Paste the draft order first."; return; }
  let order;
  if (slots.some((s) => s.round)) {
    // A pick sheet: order by round, then pick. Keep the pick numbers if they're already overall numbers (each one
    // higher than the last); if they restart every round, number the picks 1, 2, 3… straight through.
    const sorted = [...slots].sort((a, b) => (a.round || 0) - (b.round || 0) || (a.compensatory === b.compensatory ? 0 : a.compensatory ? 1 : -1) || a.pick - b.pick);
    const overall = sorted.every((s, i) => i === 0 || s.pick > sorted[i - 1].pick);
    order = sorted.map((s, i) => ({ year: dkYear, pick: overall ? s.pick : i + 1, round: s.round || 1, teamId: s.teamId,
      ...(s.fromTeam ? { fromTeam: s.fromTeam } : {}), ...(s.compensatory ? { compensatory: true } : {}) }));
  } else if (slots.length <= 32 && slots.every((s) => s.pick <= 32 && !s.compensatory)) {
    const originals = slots.map((s) => s.fromTeam || s.teamId);
    const twice = [...new Set(originals.filter((t, i) => originals.indexOf(t) !== i))];
    if (twice.length) { dkStatus.textContent = `Each team's own first-round pick can only be in the order once, but ${twice.join(", ")} ${twice.length === 1 ? "is" : "are"} there twice (a traded pick is written as the new team with the original team in brackets: "Chicago Bears (CAR)" in Carolina's spot).`; return; }
    if (slots.length < 32 && !(await confirmAction(`Only ${slots.length} teams were pasted. Build seven rounds from them anyway?`, { confirmLabel: "Build order" }))) return;
    order = dkExpandOrder(slots.sort((a, b) => a.pick - b.pick));
  } else {
    order = slots.map((s) => ({ year: dkYear, pick: s.pick, round: 1, teamId: s.teamId, ...(s.fromTeam ? { fromTeam: s.fromTeam } : {}), ...(s.compensatory ? { compensatory: true } : {}) }));
    drReround(order, dkYear);
    for (const s of order) delete s.roundManual;
  }
  if (dkPicks().length && !(await confirmAction(`${dkPicks().length} picks are already made. Replace the order anyway? Picks keep their pick numbers.`, { confirmLabel: "Replace order" }))) return;
  dkSave((data) => { data.draftOrder = [...(data.draftOrder || []).filter((d) => d.year !== dkYear), ...order]; linkDraftOrderToPicks(data, dkYear); },
    `Draft order saved: ${order.length} picks over ${new Set(order.map((s) => s.round)).size} rounds.${errors.length ? ` ${errors.length} line${errors.length === 1 ? "" : "s"} skipped (listed under the box).` : ""}`);
});

// Build the order from Draft Pick Manager: the box holds the 32 teams in first-round order (whose pick comes first);
// each round's picks, their owners after trades, and compensatory picks come from the manager's picks for this year.
document.querySelector("#dk-order-manager").addEventListener("click", async () => {
  const { slots, errors } = dkParseOrder(document.querySelector("#dk-order-text").value);
  dkSkipped(errors);
  const firstRound = slots.filter((s) => !s.round).sort((a, b) => a.pick - b.pick).map((s) => ({ teamId: s.fromTeam || s.teamId }));
  if (firstRound.length !== 32 || new Set(firstRound.map((s) => s.teamId)).size !== 32) {
    dkStatus.textContent = "Put all 32 teams in the box in first-round order (Fill in reverse standings gives you a start), then Build from Draft Pick Manager.";
    return;
  }
  const have = (dkData.picks || []).filter((p) => p.year === dkYear);
  if (!have.length && !(await confirmAction(`Draft Pick Manager has no ${dkYear} picks yet. Create them (seven rounds, every team its own pick) and build the order?`, { confirmLabel: "Create picks" }))) return;
  if (dkPicks().length && !(await confirmAction(`${dkPicks().length} picks are already made. Rebuild the order anyway? Picks keep their pick numbers.`, { confirmLabel: "Rebuild order" }))) return;
  const order = dkExpandOrder(firstRound, true);
  dkSave((data) => { data.draftOrder = [...(data.draftOrder || []).filter((d) => d.year !== dkYear), ...order]; linkDraftOrderToPicks(data, dkYear); },
    `Draft order built from Draft Pick Manager: ${order.length} picks over ${new Set(order.map((s) => s.round)).size} rounds, ${order.filter((s) => s.fromTeam).length} of them traded. Trades of these picks now show up here automatically.`);
});

document.querySelector("#dk-order-standings").addEventListener("click", () => {
  const teams = dkData.standings?.teams || {};
  const pct = (r) => (r ? (r.w + r.t / 2) / Math.max(1, r.w + r.l + r.t) : 0);
  const order = nflTeams.map(({ id }) => id).sort((a, b) => pct(teams[a]) - pct(teams[b]) ||
    ((teams[a]?.pf || 0) - (teams[a]?.pa || 0)) - ((teams[b]?.pf || 0) - (teams[b]?.pa || 0)));
  document.querySelector("#dk-order-text").value = order.map((id, i) => `${i + 1}, ${teamName(id)}`).join("\n");
  dkStatus.textContent = `Filled in worst record first from the ${dkData.standings?.season || ""} standings. Adjust the order if needed, then Build from Draft Pick Manager.`;
});
document.querySelector("#dk-order-current").addEventListener("click", () => {
  const order = dkOrder();
  document.querySelector("#dk-order-text").value = order.length
    ? ["Current, Round, Original, Pick Number", ...order.map((s) => `${s.teamId}, ${s.round}${s.compensatory ? "*" : ""}, ${s.fromTeam || s.teamId}, ${s.pick}`)].join("\n")
    : "";
});

// ---------- Draft setup: combine results ----------
// Columns are matched from a header row (NFL.com's combine tracker table, or a spreadsheet); otherwise
// Name, Ht, Wt, 40, Bench, Vert, Broad, 3-Cone, Shuttle.
const dkCombineCols = [
  ["name", /^(name|player|prospect)$/], ["ht", /^(ht|height)$/], ["wt", /^(wt|weight)$/], ["forty", /^(40|40yd|40yard|40yarddash|forty|40time|dash)$/],
  ["bench", /^(bench|benchpress|bp|reps)$/], ["vert", /^(vert|vertical|verticaljump|vj)$/], ["broad", /^(broad|broadjump|bj)$/],
  ["cone", /^(3cone|3conedrill|cone|threecone)$/], ["shuttle", /^(shuttle|20yardshuttle|20yshuttle|ss|shortshuttle)$/], ["arm", /^(arm|arms|armlength)$/], ["hand", /^(hand|hands|handsize)$/],
];
const dkCombineDefault = ["name", "ht", "wt", "forty", "bench", "vert", "broad", "cone", "shuttle"];
function dkParseCombine(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const split = (l) => (l.includes("\t") ? l.split("\t") : l.split(/,(?!\d{3}\b)/)).map((c) => c.trim());
  let cols = dkCombineDefault;
  const out = [];
  lines.forEach((line) => {
    const cells = split(line);
    const keys = cells.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const mapped = keys.map((k) => (dkCombineCols.find(([, re]) => re.test(k)) || [null])[0]);
    if (mapped.includes("name") && mapped.filter(Boolean).length >= 2) { cols = mapped; return; } // header row
    const row = { year: dkYear };
    cols.forEach((key, i) => {
      const v = String(cells[i] ?? "").replace(/^(dnp|-+|—|n\/a)$/i, "").slice(0, key === "name" ? 70 : 12);
      if (key && v) row[key] = v;
    });
    if (row.name && Object.keys(row).length > 2) out.push(row);
  });
  return out;
}
function dkCombineFor(player, year = dkYear) { return combineResultsFor(dkData, player, year); }
const dkCombineLabels = combineShortLabels;
function dkRenderCombineCount() {
  const n = (dkData.draftCombine || []).filter((c) => c.year === dkYear).length;
  const el = document.querySelector("#dk-combine-count");
  const built = typeof nflCombineData === "object" && nflCombineData[dkYear] ? nflCombineData[dkYear].length : 0;
  if (el) el.textContent = `${built ? `${built} players' ${dkYear} results built in (Pro Football Reference). ` : ""}${n ? `${n} pasted.` : built ? "" : "No combine results yet."}`;
}
document.querySelector("#dk-combine-add").addEventListener("click", () => {
  const add = dkParseCombine(document.querySelector("#dk-combine-text").value);
  if (!add.length) { dkStatus.textContent = "Paste combine results first (a name and at least one measurement on each line)."; return; }
  const keys = new Set(add.map((c) => dkNameKey(c.name)));
  if (dkSave((data) => {
    data.draftCombine = [...(data.draftCombine || []).filter((c) => c.year !== dkYear || !keys.has(dkNameKey(c.name))), ...add];
  }, `Saved combine results for ${add.length} player${add.length === 1 ? "" : "s"}.`)) {
    document.querySelector("#dk-combine-text").value = "";
    dkRenderCombineCount();
  }
});
document.querySelector("#dk-combine-clear").addEventListener("click", async () => {
  const n = (dkData.draftCombine || []).filter((c) => c.year === dkYear).length;
  if (!n) { dkStatus.textContent = "There are no combine results to clear."; return; }
  if (!(await confirmAction(`Remove the ${dkYear} combine results for ${n} player${n === 1 ? "" : "s"}?`, { confirmLabel: "Clear combine results", danger: true }))) return;
  if (dkSave((data) => { data.draftCombine = (data.draftCombine || []).filter((c) => c.year !== dkYear); }, "Combine results cleared.")) dkRenderCombineCount();
});

// ---------- Draft setup: last season's records (for the ticker's NEXT row) ----------
function dkRenderRecordsCount() {
  const el = document.querySelector("#dk-records-count");
  if (!el) return;
  const season = dkYear - 1;
  const n = Object.keys(dkData.seasonRecords?.[season] || {}).length;
  const shown = nflTeams.filter(({ id }) => seasonRecordFor(dkData, id, season)).length;
  el.textContent = n ? `${n} team${n === 1 ? "" : "s"} entered for ${season}.` : shown ? `${season} records found on the site for ${shown} teams.` : `No ${season} records yet.`;
}
document.querySelector("#dk-records-save").addEventListener("click", () => {
  const season = dkYear - 1;
  const rows = {};
  const skipped = [];
  for (const line of document.querySelector("#dk-records-text").value.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const cells = t.includes("\t") ? t.split("\t") : t.split(",");
    const team = drTeamToken ? drTeamToken(cells[0].trim()) : null;
    const id = (team && nflTeams.some((x) => x.id === team) ? team : null) || nflTeams.find((x) => x.id.toLowerCase() === cells[0].trim().toLowerCase() || x.name.toLowerCase() === cells[0].trim().toLowerCase())?.id;
    const nums = (cells.slice(1).join(" ").match(/\d+/g) || []).map(Number);
    if (!id || nums.length < 2) { if (!/^(team|rk|#)/i.test(t)) skipped.push(cells[0].trim()); continue; }
    rows[id] = { w: Math.min(20, nums[0]), l: Math.min(20, nums[1]), t: Math.min(20, nums[2] || 0) };
  }
  const n = Object.keys(rows).length;
  if (!n) { dkStatus.textContent = "Paste each team's record, like: Chicago Bears, 11-6"; return; }
  if (dkSave((data) => { data.seasonRecords = { ...(data.seasonRecords || {}), [season]: { ...(data.seasonRecords?.[season] || {}), ...rows } }; },
    `Saved ${season} records for ${n} team${n === 1 ? "" : "s"}.${skipped.length ? ` Skipped: ${skipped.join(", ")}.` : ""}`)) {
    document.querySelector("#dk-records-text").value = "";
    dkRenderRecordsCount();
  }
});
document.querySelector("#dk-records-clear").addEventListener("click", async () => {
  const season = dkYear - 1;
  if (!dkData.seasonRecords?.[season]) { dkStatus.textContent = `No ${season} records were entered.`; return; }
  if (!(await confirmAction(`Clear the ${season} records you entered?`, { confirmLabel: "Clear records", danger: true }))) return;
  if (dkSave((data) => { delete data.seasonRecords[season]; if (!Object.keys(data.seasonRecords).length) delete data.seasonRecords; }, `${season} records cleared.`)) dkRenderRecordsCount();
});

// ---------- Draft setup: pool ----------
function dkParsePool(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || /^(rank|rk|name|player)\b[^\d]*$/i.test(t)) return;
    let cells = drSplit(t);
    if (!cells) { // spaces only: "1 Fernando Mendoza QB Indiana"
      const words = t.split(/\s+/);
      const rank = /^\d+\.?$/.test(words[0]) ? words.shift() : "";
      const posAt = words.findIndex((w, i) => i > 0 && drPositions.has(w.toUpperCase()));
      cells = [rank, (posAt === -1 ? words : words.slice(0, posAt)).join(" "), posAt === -1 ? "" : words[posAt], posAt === -1 ? "" : words.slice(posAt + 1).join(" ")];
    } else if (!/^\d+\.?$/.test(cells[0])) cells = ["", ...cells];
    const [rank, name, position, ...college] = cells;
    if (!name) return;
    const p = { id: newRecordId("prospect"), year: dkYear, name: name.slice(0, 70) };
    if (/^\d+/.test(rank)) p.rank = Math.min(5000, Number.parseInt(rank, 10));
    if (position) p.position = position.toUpperCase().slice(0, 10);
    if (college.filter(Boolean).length) p.college = college.filter(Boolean).join(", ").slice(0, 80);
    out.push(p);
  });
  return out;
}
document.querySelector("#dk-pool-add").addEventListener("click", () => {
  const add = dkParsePool(document.querySelector("#dk-pool-text").value);
  if (!add.length) { dkStatus.textContent = "Paste some prospects first."; return; }
  const have = new Set(dkPool().map((p) => normalizePlayerName(p.name)));
  const fresh = add.filter((p) => !have.has(normalizePlayerName(p.name)));
  if (dkSave((data) => { data.draftPool = [...(data.draftPool || []), ...fresh]; },
    `Added ${fresh.length} prospect${fresh.length === 1 ? "" : "s"} to the Draft Pool${add.length > fresh.length ? ` (${add.length - fresh.length} already in it)` : ""}.`)) {
    document.querySelector("#dk-pool-text").value = "";
    if (fresh.length) dkFindHeadshots(fresh, `Added ${fresh.length} prospect${fresh.length === 1 ? "" : "s"}.`);
  }
});

// ---------- Draft setup: prospect headshots (prospect-headshots.js) ----------
// Runs on its own after prospects are added, and from the Find headshots button for anyone still without one.
let dkFindingPhotos = false;
async function dkFindHeadshots(prospects, lead = "") {
  if (dkFindingPhotos || typeof findPoolHeadshots !== "function") return;
  const button = document.querySelector("#dk-pool-photos");
  dkFindingPhotos = true;
  button.disabled = true;
  const prefix = lead ? `${lead} ` : "";
  dkStatus.textContent = `${prefix}Looking for headshots on ESPN…`;
  try {
    const result = await findPoolHeadshots(prospects, { onProgress: (done, total) => { dkStatus.textContent = `${prefix}Looking for headshots on ESPN… ${done} of ${total}`; } });
    if (!result.checked) { dkStatus.textContent = `${prefix}Every prospect already has a headshot.`; return; }
    if (result.unreachable) { dkStatus.textContent = `${prefix}ESPN couldn't be reached from this browser, so no headshots were found. Try Find headshots again later, or add photos on each prospect's profile.`; return; }
    let set = 0;
    if (result.found.size) {
      try { dkData = readStoredOffice() || dkData; } catch { /* use what's on screen */ }
      dkSave((data) => { set = applyPoolHeadshots(data, result.found); });
    }
    const miss = result.missing.length;
    dkStatus.textContent = `${prefix}Found ${set} headshot${set === 1 ? "" : "s"}${miss ? `; none on ESPN for ${miss} (${result.missing.slice(0, 6).join(", ")}${miss > 6 ? ", …" : ""}), add those on the prospect's profile` : ""}.`;
  } finally {
    dkFindingPhotos = false;
    button.disabled = false;
  }
}
document.querySelector("#dk-pool-photos").addEventListener("click", () => {
  const pool = dkPool();
  if (!pool.length) { dkStatus.textContent = "The Draft Pool is empty."; return; }
  dkFindHeadshots(pool);
});
document.querySelector("#dk-pool-nfl").addEventListener("click", () => {
  const use = () => {
    const rows = nflDraftHistory[dkYear];
    if (!rows) { dkStatus.textContent = `There's no NFL draft class on file for ${dkYear}.`; return; }
    document.querySelector("#dk-pool-text").value = rows.map(([, pick, , name, pos, college]) => `${pick}, ${name}, ${pos}, ${college}`).join("\n");
    dkStatus.textContent = `The real ${dkYear} NFL draft class is in the box, ranked by where they were picked. Edit it if you like, then Add to pool.`;
  };
  if (typeof nflDraftHistory === "object") { use(); return; }
  const script = document.createElement("script");
  script.src = "nfl-drafts.js";
  script.onload = use;
  script.onerror = () => { dkStatus.textContent = "The NFL draft file couldn't be loaded."; };
  document.head.append(script);
});
document.querySelector("#dk-pool-clear").addEventListener("click", async () => {
  if (!dkPool().length) { dkStatus.textContent = "The pool is already empty."; return; }
  if (!(await confirmAction(`Remove all ${dkPool().length} prospects from the ${dkYear} Draft Pool? Picks already made stay.`, { confirmLabel: "Clear pool", danger: true }))) return;
  dkSave((data) => { data.draftPool = (data.draftPool || []).filter((p) => p.year !== dkYear); }, "Draft Pool cleared.");
});
document.querySelector("#dk-reset").addEventListener("click", async () => {
  if (!dkPicks().length) { dkStatus.textContent = "No picks have been made."; return; }
  if (!(await confirmAction(`Clear all ${dkPicks().length} picks from the ${dkYear} draft? The order and the pool stay.`, { confirmLabel: "Clear picks", danger: true }))) return;
  dkSave((data) => { data.draftHistory = (data.draftHistory || []).filter((d) => d.year !== dkYear); }, "All picks cleared. The first pick is on the clock.");
});

if (!dkCanSave) document.querySelector("#dk-setup").hidden = true;
if (!dkOrder().length) document.querySelector("#dk-setup").open = true;
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { dkData = readStoredOffice() || emptyOfficeData(); dkRender(); } catch { /* keep the current view */ }
});
dkTimerLeft = dkTimerLength();
dkTimerShow();
dkRender();
dkRenderCombineCount();
dkRenderRecordsCount();

// ---------- Countdown sound ----------
// With 10 seconds left: built-in beeps (Web Audio, a beep a second, higher for the last 3, a horn at 0:00), or the
// commissioner's own sound file, played once from 10 seconds left. The file is kept in this browser's IndexedDB and
// the on/off and volume choices in localStorage. Starting the clock counts as the click browsers need before sound.
const dkSoundKey = "nbf-draft-sound";
let dkAudioCtx = null, dkCustomUrl = null, dkCustomAudio = null;
const dkSoundOn = () => document.querySelector("#dk-sound").checked;
const dkVolume = () => Number(document.querySelector("#dk-volume").value);
function dkCtx() {
  if (!dkAudioCtx) { const C = window.AudioContext || window.webkitAudioContext; if (C) dkAudioCtx = new C(); }
  if (dkAudioCtx?.state === "suspended") dkAudioCtx.resume();
  return dkAudioCtx;
}
function dkBeep(freq, length, type = "sine") {
  const ctx = dkCtx();
  if (!ctx) return;
  const t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.5 * dkVolume()), t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
}
function dkHorn() { dkBeep(220, 1.1, "sawtooth"); dkBeep(277, 1.1, "sawtooth"); dkBeep(330, 1.1, "square"); }
function dkSoundTick(left) {
  if (!dkSoundOn() || left > 10 || left < 0) return;
  if (dkCustomUrl) {
    if (left === 10) { dkSoundStop(); dkCustomAudio = new Audio(dkCustomUrl); dkCustomAudio.volume = dkVolume(); dkCustomAudio.play().catch(() => {}); }
    return;
  }
  if (left === 0) dkHorn();
  else dkBeep(left <= 3 ? 1320 : 880, left <= 3 ? 0.25 : 0.12);
}
function dkSoundStop() { if (dkCustomAudio) { dkCustomAudio.pause(); dkCustomAudio = null; } }

// IndexedDB store for the custom sound file.
function dkSoundDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nbf-draft-sound", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dkSoundFile(action, blob, key = "countdown") {
  const db = await dkSoundDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", action === "get" ? "readonly" : "readwrite");
    const store = tx.objectStore("files");
    const req = action === "get" ? store.get(key) : action === "put" ? store.put(blob, key) : store.delete(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function dkSoundLabel(name) {
  document.querySelector("#dk-sound-now").textContent = name ? `Your file: ${name}` : "Built-in beeps";
  document.querySelector("#dk-sound-clear").hidden = !name;
}
async function dkLoadCustomSound() {
  try {
    const file = await dkSoundFile("get");
    if (dkCustomUrl) URL.revokeObjectURL(dkCustomUrl);
    dkCustomUrl = file ? URL.createObjectURL(file) : null;
    dkSoundLabel(file ? file.name || "custom sound" : "");
  } catch { dkSoundLabel(""); }
}
document.querySelector("#dk-sound-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("audio/")) { dkStatus.textContent = "That isn't a sound file. Choose an MP3, WAV or OGG."; return; }
  if (file.size > 5 * 1024 * 1024) { dkStatus.textContent = "That file is over 5 MB. Use a shorter clip (about 10 seconds)."; return; }
  try {
    await dkSoundFile("put", new File([file], file.name, { type: file.type }));
    await dkLoadCustomSound();

// ---------- Pick sound ----------
// Plays when a pick is made: a built-in chime (a rising bell arpeggio) or the commissioner's own file ("pick" in the
// same IndexedDB store).
let dkPickUrl = null;
function dkChime() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => { dkBeep(f, 0.9, "triangle"); dkBeep(f * 2, 0.5, "sine"); }, i * 140));
}
function dkPlayPickSound() {
  if (!document.querySelector("#dk-pick-sound").checked) return;
  if (dkPickUrl) { const a = new Audio(dkPickUrl); a.volume = dkVolume(); a.play().catch(() => {}); return; }
  dkChime();
}
async function dkLoadPickSound() {
  try {
    const file = await dkSoundFile("get", null, "pick");
    if (dkPickUrl) URL.revokeObjectURL(dkPickUrl);
    dkPickUrl = file ? URL.createObjectURL(file) : null;
    document.querySelector("#dk-pick-now").textContent = file ? `Your file: ${file.name || "custom sound"}` : "Built-in chime";
    document.querySelector("#dk-pick-clear").hidden = !file;
  } catch { /* storage unavailable: built-in chime */ }
}
document.querySelector("#dk-pick-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("audio/")) { dkStatus.textContent = "That isn't a sound file. Choose an MP3, WAV or OGG."; return; }
  if (file.size > 5 * 1024 * 1024) { dkStatus.textContent = "That file is over 5 MB. Use a shorter clip."; return; }
  try {
    await dkSoundFile("put", new File([file], file.name, { type: file.type }), "pick");
    await dkLoadPickSound();
    dkStatus.textContent = `Pick sound set to ${file.name}.`;
  } catch (error) { dkStatus.textContent = `The sound couldn't be saved in this browser (${error.message || "storage unavailable"}).`; }
});
document.querySelector("#dk-pick-clear").addEventListener("click", async () => {
  try { await dkSoundFile("delete", null, "pick"); } catch { /* nothing stored */ }
  await dkLoadPickSound();
  dkStatus.textContent = "Back to the built-in pick chime.";
});
document.querySelector("#dk-pick-test").addEventListener("click", () => {
  const box = document.querySelector("#dk-pick-sound");
  const was = box.checked;
  box.checked = true;
  dkPlayPickSound();
  box.checked = was;
});
document.querySelector("#dk-pick-sound").addEventListener("change", () => {
  try { localStorage.setItem(`${dkSoundKey}-pick`, document.querySelector("#dk-pick-sound").checked ? "on" : "off"); } catch { /* fine */ }
});
try { if (localStorage.getItem(`${dkSoundKey}-pick`) === "off") document.querySelector("#dk-pick-sound").checked = false; } catch { /* default on */ }
dkLoadPickSound();
    dkStatus.textContent = `Countdown sound set to ${file.name}. It plays from 10 seconds left.`;
  } catch (error) { dkStatus.textContent = `The sound couldn't be saved in this browser (${error.message || "storage unavailable"}).`; }
});
document.querySelector("#dk-sound-clear").addEventListener("click", async () => {
  try { await dkSoundFile("delete"); } catch { /* nothing stored */ }
  await dkLoadCustomSound();

// ---------- Pick sound ----------
// Plays when a pick is made: a built-in chime (a rising bell arpeggio) or the commissioner's own file ("pick" in the
// same IndexedDB store).
let dkPickUrl = null;
function dkChime() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => { dkBeep(f, 0.9, "triangle"); dkBeep(f * 2, 0.5, "sine"); }, i * 140));
}
function dkPlayPickSound() {
  if (!document.querySelector("#dk-pick-sound").checked) return;
  if (dkPickUrl) { const a = new Audio(dkPickUrl); a.volume = dkVolume(); a.play().catch(() => {}); return; }
  dkChime();
}
async function dkLoadPickSound() {
  try {
    const file = await dkSoundFile("get", null, "pick");
    if (dkPickUrl) URL.revokeObjectURL(dkPickUrl);
    dkPickUrl = file ? URL.createObjectURL(file) : null;
    document.querySelector("#dk-pick-now").textContent = file ? `Your file: ${file.name || "custom sound"}` : "Built-in chime";
    document.querySelector("#dk-pick-clear").hidden = !file;
  } catch { /* storage unavailable: built-in chime */ }
}
document.querySelector("#dk-pick-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("audio/")) { dkStatus.textContent = "That isn't a sound file. Choose an MP3, WAV or OGG."; return; }
  if (file.size > 5 * 1024 * 1024) { dkStatus.textContent = "That file is over 5 MB. Use a shorter clip."; return; }
  try {
    await dkSoundFile("put", new File([file], file.name, { type: file.type }), "pick");
    await dkLoadPickSound();
    dkStatus.textContent = `Pick sound set to ${file.name}.`;
  } catch (error) { dkStatus.textContent = `The sound couldn't be saved in this browser (${error.message || "storage unavailable"}).`; }
});
document.querySelector("#dk-pick-clear").addEventListener("click", async () => {
  try { await dkSoundFile("delete", null, "pick"); } catch { /* nothing stored */ }
  await dkLoadPickSound();
  dkStatus.textContent = "Back to the built-in pick chime.";
});
document.querySelector("#dk-pick-test").addEventListener("click", () => {
  const box = document.querySelector("#dk-pick-sound");
  const was = box.checked;
  box.checked = true;
  dkPlayPickSound();
  box.checked = was;
});
document.querySelector("#dk-pick-sound").addEventListener("change", () => {
  try { localStorage.setItem(`${dkSoundKey}-pick`, document.querySelector("#dk-pick-sound").checked ? "on" : "off"); } catch { /* fine */ }
});
try { if (localStorage.getItem(`${dkSoundKey}-pick`) === "off") document.querySelector("#dk-pick-sound").checked = false; } catch { /* default on */ }
dkLoadPickSound();
  dkStatus.textContent = "Back to the built-in countdown beeps.";
});
document.querySelector("#dk-sound-test").addEventListener("click", () => {
  dkSoundStop();
  if (dkCustomUrl) { dkCustomAudio = new Audio(dkCustomUrl); dkCustomAudio.volume = dkVolume(); dkCustomAudio.play().catch(() => {}); return; }
  let n = 10;
  dkBeep(880, 0.12);
  const demo = setInterval(() => { n -= 1; if (n <= 0) { clearInterval(demo); dkHorn(); return; } dkBeep(n <= 3 ? 1320 : 880, n <= 3 ? 0.25 : 0.12); }, 1000);
});
document.querySelector("#dk-timer-toggle").addEventListener("click", () => { if (dkSoundOn()) dkCtx(); }); // unlock audio
for (const id of ["#dk-sound", "#dk-volume", "#dk-timer-length"]) {
  document.querySelector(id).addEventListener("change", () => {
    try { localStorage.setItem(dkSoundKey, JSON.stringify({ on: dkSoundOn(), volume: dkVolume(), seconds: dkTimerLength() })); } catch { /* fine */ }
    if (dkCustomAudio) dkCustomAudio.volume = dkVolume();
    if (!dkSoundOn()) dkSoundStop();
  });
}
try {
  const saved = JSON.parse(localStorage.getItem(dkSoundKey) || "null");
  if (saved) {
    document.querySelector("#dk-sound").checked = saved.on !== false;
    if (Number.isFinite(saved.volume)) document.querySelector("#dk-volume").value = saved.volume;
    const length = document.querySelector("#dk-timer-length");
    if ([...length.options].some((o) => Number(o.value) === saved.seconds)) { length.value = String(saved.seconds); if (!dkTimerHandle) { dkTimerLeft = saved.seconds; dkTimerShow(); } }
  }
} catch { /* defaults */ }
dkLoadCustomSound();

// ---------- Pick sound ----------
// Plays when a pick is made: a built-in chime (a rising bell arpeggio) or the commissioner's own file ("pick" in the
// same IndexedDB store).
let dkPickUrl = null;
function dkChime() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => { dkBeep(f, 0.9, "triangle"); dkBeep(f * 2, 0.5, "sine"); }, i * 140));
}
function dkPlayPickSound() {
  if (!document.querySelector("#dk-pick-sound").checked) return;
  if (dkPickUrl) { const a = new Audio(dkPickUrl); a.volume = dkVolume(); a.play().catch(() => {}); return; }
  dkChime();
}
async function dkLoadPickSound() {
  try {
    const file = await dkSoundFile("get", null, "pick");
    if (dkPickUrl) URL.revokeObjectURL(dkPickUrl);
    dkPickUrl = file ? URL.createObjectURL(file) : null;
    document.querySelector("#dk-pick-now").textContent = file ? `Your file: ${file.name || "custom sound"}` : "Built-in chime";
    document.querySelector("#dk-pick-clear").hidden = !file;
  } catch { /* storage unavailable: built-in chime */ }
}
document.querySelector("#dk-pick-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("audio/")) { dkStatus.textContent = "That isn't a sound file. Choose an MP3, WAV or OGG."; return; }
  if (file.size > 5 * 1024 * 1024) { dkStatus.textContent = "That file is over 5 MB. Use a shorter clip."; return; }
  try {
    await dkSoundFile("put", new File([file], file.name, { type: file.type }), "pick");
    await dkLoadPickSound();
    dkStatus.textContent = `Pick sound set to ${file.name}.`;
  } catch (error) { dkStatus.textContent = `The sound couldn't be saved in this browser (${error.message || "storage unavailable"}).`; }
});
document.querySelector("#dk-pick-clear").addEventListener("click", async () => {
  try { await dkSoundFile("delete", null, "pick"); } catch { /* nothing stored */ }
  await dkLoadPickSound();
  dkStatus.textContent = "Back to the built-in pick chime.";
});
document.querySelector("#dk-pick-test").addEventListener("click", () => {
  const box = document.querySelector("#dk-pick-sound");
  const was = box.checked;
  box.checked = true;
  dkPlayPickSound();
  box.checked = was;
});
document.querySelector("#dk-pick-sound").addEventListener("change", () => {
  try { localStorage.setItem(`${dkSoundKey}-pick`, document.querySelector("#dk-pick-sound").checked ? "on" : "off"); } catch { /* fine */ }
});
try { if (localStorage.getItem(`${dkSoundKey}-pick`) === "off") document.querySelector("#dk-pick-sound").checked = false; } catch { /* default on */ }
dkLoadPickSound();

document.querySelector("#dk-live").addEventListener("click", async () => {
  const live = dkData.draftLive === dkYear;
  if (live && !(await confirmAction("End the draft? The draft ticker comes off every page. Picks, the order and the pool stay.", { confirmLabel: "End draft" }))) return;
  dkSave((data) => { if (live) delete data.draftLive; else data.draftLive = dkYear; },
    live ? "Draft ended. The ticker is off." : `The ${dkYear} draft is live: the draft ticker now shows at the bottom of every page until the last pick is in.`);
});

// ---------- Draft-day trades ----------
// "Trade a pick" moves an open pick to another team (tradeDraftOrderPick in league-core.js); trades approved under
// Admin › Pending Trades that include a pick in this draft do the same. Each shows on the draft ticker as a TRADE
// header, and plays the trade sound here while the draft is live.
function dkFillTradeForm() {
  const pickSelect = document.querySelector("#dk-trade-pick");
  const keep = pickSelect.value;
  const open = dkOrder().filter((s) => !dkMadeAt(s.pick));
  pickSelect.replaceChildren(new Option("Choose a pick", ""), ...open.map((s) => new Option(`Rd ${s.round} · Pick ${s.pick}${s.compensatory ? "*" : ""} · ${teamName(s.teamId)}`, String(s.pick))));
  if ([...pickSelect.options].some((o) => o.value === keep)) pickSelect.value = keep;
  const to = document.querySelector("#dk-trade-to");
  if (to.options.length <= 1) to.append(...[...nflTeams].sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name }) => new Option(name, id)));
}
document.querySelector("#dk-trade-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pick = Number(document.querySelector("#dk-trade-pick").value);
  const to = document.querySelector("#dk-trade-to").value;
  const slot = dkOrder().find((s) => s.pick === pick);
  if (!slot || !to) { dkStatus.textContent = "Choose the pick and the team getting it."; return; }
  if (slot.teamId === to) { dkStatus.textContent = `The ${teamName(to)} already have pick ${pick}.`; return; }
  if (!(await confirmAction(`Trade pick ${pick} (round ${slot.round}) from the ${teamName(slot.teamId)} to the ${teamName(to)}?`, { confirmLabel: "Record trade" }))) return;
  let trade = null;
  if (dkSave((data) => { trade = tradeDraftOrderPick(data, dkYear, pick, to); }, `Trade: pick ${pick} goes from the ${teamName(slot.teamId)} to the ${teamName(to)}.`) && trade) {
    dkSeenTrades.add(trade.id); // the draft ticker plays the trade sound
    event.currentTarget?.reset?.();
  }
});

// Trade sound: built-in (a quick two-note "whoosh" and bell) or the commissioner's own file ("trade" in IndexedDB).
let dkTradeUrl = null;
const dkSeenTrades = new Set((dkData.draftTrades || []).map((t) => t.id));
function dkPlayTradeSound() {
  if (dkData.draftLive !== dkYear || !document.querySelector("#dk-trade-sound").checked) return; // only while the draft is live
  if (dkTradeUrl) { const a = new Audio(dkTradeUrl); a.volume = dkVolume(); a.play().catch(() => {}); return; }
  dkBeep(392, 0.18, "square");
  setTimeout(() => dkBeep(587.33, 0.18, "square"), 160);
  setTimeout(() => { dkBeep(783.99, 0.9, "triangle"); dkBeep(1174.66, 0.6, "sine"); }, 330);
}
async function dkLoadTradeSound() {
  try {
    const file = await dkSoundFile("get", null, "trade");
    if (dkTradeUrl) URL.revokeObjectURL(dkTradeUrl);
    dkTradeUrl = file ? URL.createObjectURL(file) : null;
    document.querySelector("#dk-trade-now").textContent = file ? `Your file: ${file.name || "custom sound"}` : "Built-in trade sound";
    document.querySelector("#dk-trade-clear").hidden = !file;
  } catch { /* built-in */ }
}
document.querySelector("#dk-trade-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("audio/")) { dkStatus.textContent = "That isn't a sound file. Choose an MP3, WAV or OGG."; return; }
  if (file.size > 5 * 1024 * 1024) { dkStatus.textContent = "That file is over 5 MB. Use a shorter clip."; return; }
  try {
    await dkSoundFile("put", new File([file], file.name, { type: file.type }), "trade");
    await dkLoadTradeSound();
    dkStatus.textContent = `Trade sound set to ${file.name}.`;
  } catch (error) { dkStatus.textContent = `The sound couldn't be saved in this browser (${error.message || "storage unavailable"}).`; }
});
document.querySelector("#dk-trade-clear").addEventListener("click", async () => {
  try { await dkSoundFile("delete", null, "trade"); } catch { /* nothing stored */ }
  await dkLoadTradeSound();
  dkStatus.textContent = "Back to the built-in trade sound.";
});
document.querySelector("#dk-trade-test").addEventListener("click", () => {
  if (dkTradeUrl) { const a = new Audio(dkTradeUrl); a.volume = dkVolume(); a.play().catch(() => {}); return; }
  dkBeep(392, 0.18, "square"); setTimeout(() => dkBeep(587.33, 0.18, "square"), 160);
  setTimeout(() => { dkBeep(783.99, 0.9, "triangle"); dkBeep(1174.66, 0.6, "sine"); }, 330);
});
document.querySelector("#dk-trade-sound").addEventListener("change", () => {
  try { localStorage.setItem(`${dkSoundKey}-trade`, document.querySelector("#dk-trade-sound").checked ? "on" : "off"); } catch { /* fine */ }
});
try { if (localStorage.getItem(`${dkSoundKey}-trade`) === "off") document.querySelector("#dk-trade-sound").checked = false; } catch { /* default on */ }
// A trade approved on another page or tab (Admin › Pending Trades) plays the sound here too.
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  const fresh = (dkData.draftTrades || []).filter((t) => t.year === dkYear && !dkSeenTrades.has(t.id));
  for (const t of fresh) dkSeenTrades.add(t.id);
  if (fresh.some((t) => Date.now() - Date.parse(t.at) < 15000)) { // the draft ticker plays the trade sound
    const t = fresh[fresh.length - 1];
    dkStatus.textContent = `Trade: pick ${t.pick} goes from the ${teamName(t.fromTeam)} to the ${teamName(t.toTeam)}.`;
  }
});
dkLoadTradeSound();
dkFillTradeForm();

// Sounds: the settings open from the Sounds button next to the per-pick time.
document.querySelector("#dk-sounds-open").addEventListener("click", () => document.querySelector("#dk-sound-panel").showModal());
document.querySelector("#dk-sound-close").addEventListener("click", () => document.querySelector("#dk-sound-panel").close());
document.querySelector("#dk-sound-panel").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
