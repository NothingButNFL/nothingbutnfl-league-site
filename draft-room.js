// Season Information › Draft (draft.html): the live draft room for this year's draft, run by the commissioner on one
// screen. Shows the team on the clock (with the pick clock and who's up next), the Draft Pool to pick from, a form for
// a player who isn't in the pool, and the board of picks made. Every pick is saved to data.draftHistory, so the draft
// also appears in League History › Previous Drafts. The order (data.draftOrder) and pool (data.draftPool) are set up
// under Draft setup. Uses league-core.js and draft-core.js.
const dkYear = currentLeagueYear();
const dkStatus = document.querySelector("#dk-status");
let dkData = emptyOfficeData();
let dkCanSave = true;
try { dkData = readStoredOffice() || emptyOfficeData(); } catch { dkCanSave = false; }
let dkRound = 0; // board tab: 0 = the round on the clock

const dkOrder = () => (dkData.draftOrder || []).filter((d) => d.year === dkYear).sort((a, b) => a.pick - b.pick);
const dkPicks = () => (dkData.draftHistory || []).filter((d) => d.year === dkYear);
const dkPool = () => (dkData.draftPool || []).filter((p) => p.year === dkYear);
const dkMadeAt = (pick) => dkPicks().find((d) => d.pick === pick);
const dkOnClock = () => dkOrder().find((slot) => !dkMadeAt(slot.pick)) || null;
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
  const slot = dkOnClock();
  if (!slot) { dkStatus.textContent = dkOrder().length ? "Every pick has been made." : "Set the draft order under Draft setup first."; return; }
  const entry = { id: newRecordId("draft"), year: dkYear, round: slot.round, pick: slot.pick, teamId: slot.teamId, player: player.name.trim().slice(0, 70) };
  if (slot.compensatory) entry.compensatory = true;
  if (slot.fromTeam) entry.fromTeam = slot.fromTeam;
  if (player.position) entry.position = player.position.trim().toUpperCase().slice(0, 10);
  if (player.college) entry.college = player.college.trim().slice(0, 80);
  if (player.poolId) entry.poolId = player.poolId;
  entry.roundManual = true; // the round comes from the draft order
  const ok = dkSave((data) => { data.draftHistory = [...(data.draftHistory || []).filter((d) => !(d.year === dkYear && d.pick === slot.pick)), entry]; },
    `Pick ${slot.pick}: the ${teamName(slot.teamId)} select ${entry.player}${entry.position ? `, ${entry.position}` : ""}${entry.college ? `, ${entry.college}` : ""}.`);
  if (ok) dkTimerRestart();
}

document.querySelector("#dk-own").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const f = form.elements;
  const slot = dkOnClock();
  if (!slot) { dkMakePick({ name: "" }); return; }
  if (!(await confirmAction(`Pick ${slot.pick}: the ${teamName(slot.teamId)} select ${f.name.value.trim()}?`, { confirmLabel: "Make the pick" }))) return;
  dkMakePick({ name: f.name.value, position: f.position.value, college: f.college.value });
  form.reset();
});

document.querySelector("#dk-undo").addEventListener("click", async () => {
  const made = dkPicks().sort((a, b) => b.pick - a.pick)[0];
  if (!made) { dkStatus.textContent = "No picks to undo."; return; }
  if (!(await confirmAction(`Undo pick ${made.pick}, ${made.player} to the ${teamName(made.teamId)}? He goes back into the pool.`, { confirmLabel: "Undo pick", danger: true }))) return;
  dkSave((data) => { data.draftHistory = data.draftHistory.filter((d) => d.id !== made.id); }, `Pick ${made.pick} undone. The ${teamName(made.teamId)} are back on the clock.`);
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
  const slot = dkOnClock();
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
  if (!slot) {
    label.textContent = "DRAFT COMPLETE";
    teamBox.replaceChildren(Object.assign(document.createElement("p"), { className: "dk-clock-note", textContent: `All ${order.length} picks are in.` }));
    pickText.textContent = "";
    document.querySelector("#dk-next").replaceChildren();
    clock.style.removeProperty("--dk-team");
    dkTimerStop();
    return;
  }
  label.textContent = "ON THE CLOCK";
  teamBox.replaceChildren(dkTeamBlock(slot, true));
  pickText.textContent = `Round ${slot.round} · Pick ${slot.pick}${slot.compensatory ? " (compensatory)" : ""}`;
  const palette = typeof teamThemePalettes === "object" ? teamThemePalettes[slot.teamId] : null;
  if (palette) clock.style.setProperty("--dk-team", palette[0]); else clock.style.removeProperty("--dk-team");
  const upcoming = order.filter((s) => s.pick > slot.pick && !dkMadeAt(s.pick)).slice(0, 4);
  const next = document.querySelector("#dk-next");
  const title = Object.assign(document.createElement("span"), { className: "dk-next-title", textContent: "UP NEXT" });
  next.replaceChildren(title, ...upcoming.map((s) => {
    const row = document.createElement("div");
    row.className = "dk-next-row";
    row.append(Object.assign(document.createElement("span"), { className: "dk-next-pick", textContent: `${s.pick}${s.compensatory ? "*" : ""}` }), dkTeamBlock(s, false));
    return row;
  }));
}

// ---------- Draft Pool ----------
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
  const slot = dkOnClock();
  document.querySelector("#dk-pool-rows").replaceChildren(...shown.slice(0, 400).map((p) => {
    const tr = document.createElement("tr");
    tr.insertCell().textContent = p.rank ?? "";
    const name = tr.insertCell();
    name.className = "dk-pool-name";
    name.textContent = p.name;
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
      const now = dkOnClock();
      if (!now) return;
      if (!(await confirmAction(`Pick ${now.pick}: the ${teamName(now.teamId)} select ${p.name}${p.position ? `, ${p.position}` : ""}${p.college ? `, ${p.college}` : ""}?`, { confirmLabel: "Make the pick" }))) return;
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
function dkRenderBoard() {
  const order = dkOrder();
  const slot = dkOnClock();
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
    li.className = `dk-slot${pick ? " is-made" : ""}${slot && s.pick === slot.pick ? " is-now" : ""}`;
    li.append(Object.assign(document.createElement("span"), { className: "dk-slot-pick", textContent: `${s.pick}${s.compensatory ? "*" : ""}` }), dkTeamBlock(s, false));
    const who = document.createElement("span");
    who.className = "dk-slot-player";
    if (pick) {
      who.append(Object.assign(document.createElement("strong"), { textContent: pick.player }), [pick.position, pick.college].filter(Boolean).join(" · "));
    } else who.textContent = slot && s.pick === slot.pick ? "On the clock" : "";
    li.append(who);
    return li;
  }));
}

function dkRender() {
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
function dkTimerShow() {
  const m = Math.floor(Math.max(0, dkTimerLeft) / 60), s = Math.max(0, dkTimerLeft) % 60;
  dkTimerEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
  document.querySelector("#dk-clock").classList.toggle("is-late", dkTimerLeft <= 30 && dkTimerHandle !== null);
  document.querySelector("#dk-clock").classList.toggle("is-expired", dkTimerLeft <= 0);
  document.querySelector("#dk-timer-toggle").textContent = dkTimerHandle ? "Pause clock" : "Start clock";
}
function dkTimerStop() { clearInterval(dkTimerHandle); dkTimerHandle = null; dkTimerShow(); }
function dkTimerStart() {
  if (dkTimerHandle || !dkOnClock()) return;
  dkTimerHandle = setInterval(() => { dkTimerLeft -= 1; if (dkTimerLeft <= 0) { dkTimerLeft = 0; clearInterval(dkTimerHandle); dkTimerHandle = null; } dkTimerShow(); }, 1000);
  dkTimerShow();
}
function dkTimerRestart() { const running = dkTimerHandle !== null; dkTimerStop(); dkTimerLeft = dkTimerLength(); if (running) dkTimerStart(); dkTimerShow(); }
document.querySelector("#dk-timer-toggle").addEventListener("click", () => (dkTimerHandle ? dkTimerStop() : dkTimerStart()));
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
//                                           overall pick or the pick within the round, and a * marks a comp pick)
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
    if (sheetCells.length >= 4 && /^\d{1,2}$/.test(sheetCells[1]) && drTeamToken(sheetCells[0]) && drTeamToken(sheetCells[2]) && drPickToken(sheetCells[3])) {
      const teamId = drTeamToken(sheetCells[0]), original = drTeamToken(sheetCells[2]), pick = drPickToken(sheetCells[3]);
      slots.push({ round: Number(sheetCells[1]), pick: pick.pick, compensatory: pick.compensatory || /\*/.test(sheetCells[2]), teamId, fromTeam: original !== teamId ? original : undefined });
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

// 32 first-round teams → seven rounds, swapping in each traded pick's owner from Draft Pick Manager (data.picks).
function dkExpandOrder(firstRound) {
  const picks = (dkData.picks || []).filter((p) => p.year === dkYear);
  const out = [];
  let number = 0;
  for (let round = 1; round <= 7; round += 1) {
    for (const s of firstRound) {
      const original = s.fromTeam || s.teamId; // whose pick it originally was
      const asset = picks.find((p) => p.round === round && p.originalTeam === original && !p.compensatory);
      const owner = round === 1 ? s.teamId : asset?.currentOwner || original;
      out.push({ year: dkYear, pick: ++number, round, teamId: owner, ...(owner !== original ? { fromTeam: original } : {}) });
    }
    // Compensatory picks for this round go at the end of it.
    for (const c of picks.filter((p) => p.round === round && p.compensatory)) {
      out.push({ year: dkYear, pick: ++number, round, teamId: c.currentOwner, compensatory: true, ...(c.currentOwner !== c.originalTeam ? { fromTeam: c.originalTeam } : {}) });
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
  dkSave((data) => { data.draftOrder = [...(data.draftOrder || []).filter((d) => d.year !== dkYear), ...order]; },
    `Draft order saved: ${order.length} picks over ${new Set(order.map((s) => s.round)).size} rounds.${errors.length ? ` ${errors.length} line${errors.length === 1 ? "" : "s"} skipped (listed under the box).` : ""}`);
});

document.querySelector("#dk-order-standings").addEventListener("click", () => {
  const teams = dkData.standings?.teams || {};
  const pct = (r) => (r ? (r.w + r.t / 2) / Math.max(1, r.w + r.l + r.t) : 0);
  const order = nflTeams.map(({ id }) => id).sort((a, b) => pct(teams[a]) - pct(teams[b]) ||
    ((teams[a]?.pf || 0) - (teams[a]?.pa || 0)) - ((teams[b]?.pf || 0) - (teams[b]?.pa || 0)));
  document.querySelector("#dk-order-text").value = order.map((id, i) => `${i + 1}, ${teamName(id)}`).join("\n");
  dkStatus.textContent = `Filled in worst record first from the ${dkData.standings?.season || ""} standings. Adjust it (and add "(from team)" for traded first-round picks), then Save draft order.`;
});
document.querySelector("#dk-order-current").addEventListener("click", () => {
  const order = dkOrder();
  document.querySelector("#dk-order-text").value = order.length
    ? ["Current, Round, Original, Pick Number", ...order.map((s) => `${s.teamId}, ${s.round}, ${s.fromTeam || s.teamId}, ${s.pick}${s.compensatory ? "*" : ""}`)].join("\n")
    : "";
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
    `Added ${fresh.length} prospect${fresh.length === 1 ? "" : "s"} to the Draft Pool${add.length > fresh.length ? ` (${add.length - fresh.length} already in it)` : ""}.`)) document.querySelector("#dk-pool-text").value = "";
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
