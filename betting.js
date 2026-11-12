// Sidebar › Betting: the week's odds board (spread, moneyline, total from league-core bettingOdds), play-money bets
// that settle from the box scores, pick'em, and leaderboards. Bettors are the Members (officeData.members); the person
// betting is picked at the top and remembered in this browser. Uses league-core.js and teams.js.
let officeData = emptyOfficeData();
let betCanSave = true;
try { officeData = readStoredOffice() || emptyOfficeData(); } catch { betCanSave = false; }

const betMemberKey = "nbf-bet-member";
const betEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const betStatus = document.querySelector("#bet-status");
const betMoney = (n) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const betPrice = (o) => (o > 0 ? `+${o}` : String(o));
const betLine = (l) => (l > 0 ? `+${l}` : l === 0 ? "PK" : String(l));
let betView = "board";
let betWeek = null;
let betSlip = null; // { game, type, side, line, odds, label }

function betSeason() { return officeData.standings?.season || currentLeagueYear(); }
function betMembers() { return (officeData.members || []).slice().sort((a, b) => a.name.localeCompare(b.name)); }
function betMe() {
  let id = "";
  try { id = localStorage.getItem(betMemberKey) || ""; } catch { /* fine */ }
  return betMembers().some((m) => m.id === id) ? id : "";
}
function betSave(message) {
  if (!betCanSave) { betStatus.textContent = "Saved league data couldn't be read, so nothing can be saved here."; return false; }
  try { writeStoredOffice(officeData); } catch (error) { betStatus.textContent = `Could not save: ${error.message}.`; return false; }
  if (message) betStatus.textContent = message;
  return true;
}
// Scheduled games for a week of the season (from the schedule, else the box scores for that week).
function betGames(week) {
  const season = betSeason();
  const sched = (officeData.schedule || []).filter((g) => g.season === season && g.week === week);
  if (sched.length) return sched.map((g) => ({ away: g.away, home: g.home, date: g.date, time: g.time }));
  return archivedGames(officeData).filter((g) => g.season === season && g.week === week).map((g) => ({ away: g.away, home: g.home, date: g.date }));
}
function betWeeks() {
  const season = betSeason();
  const set = new Set((officeData.schedule || []).filter((g) => g.season === season).map((g) => g.week));
  for (const g of archivedGames(officeData)) if (g.season === season && g.week) set.add(g.week);
  return [...set].sort((a, b) => a - b);
}
function betLogo(teamId, size = "") {
  const team = nflTeams.find(({ id }) => id === teamId);
  const wrap = betEl("span", `bet-logo${size ? ` is-${size}` : ""}`);
  const img = document.createElement("img");
  img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team?.logo || teamId.toLowerCase()}.png`;
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => { img.remove(); wrap.textContent = teamId; }, { once: true });
  wrap.append(img);
  return wrap;
}
function betRecord(teamId) {
  const r = seasonRecordFor(officeData, teamId, betSeason());
  return r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : "0-0";
}
const betLocked = (week, g) => Boolean(bettingResult(officeData, betSeason(), week, g.away, g.home));

// ---------- Odds board ----------
function renderBoard() {
  const week = betWeek;
  const season = betSeason();
  const me = betMe();
  const games = betGames(week);
  const box = document.querySelector("#bet-games");
  if (!games.length) { box.replaceChildren(betEl("p", "empty-state", `No games for week ${week}. Import the schedule under Admin › Schedule Import.`)); renderSlip(); return; }
  box.replaceChildren(...games.map((g) => {
    const key = bettingGameKey(g.away, g.home);
    const odds = bettingOdds(officeData, season, week, g.away, g.home);
    const res = bettingResult(officeData, season, week, g.away, g.home);
    const card = betEl("article", `bet-game${res ? " is-final" : ""}`);
    const head = betEl("div", "bet-game-head");
    head.append(betEl("span", "", res ? "FINAL" : [g.date ? new Date(`${g.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "", g.time || ""].filter(Boolean).join(" · ") || `WEEK ${week}`),
      betEl("span", "bet-cols", ""));
    const cols = head.lastChild;
    cols.append(betEl("b", "", "SPREAD"), betEl("b", "", "MONEY"), betEl("b", "", "TOTAL"));
    card.append(head);
    const sides = [[g.away, -odds.spread, odds.mlAway, "over", res?.awayScore], [g.home, odds.spread, odds.mlHome, "under", res?.homeScore]];
    sides.forEach(([team, spread, ml, ou, score], i) => {
      const row = betEl("div", "bet-row");
      const who = betEl("a", "bet-team");
      who.href = `team.html?team=${encodeURIComponent(team)}`;
      const nm = betEl("span", "bet-team-name");
      nm.append(betEl("strong", "", teamName(team)), betEl("small", "", `${betRecord(team)}${i ? " · Home" : ""}`));
      who.append(betLogo(team), nm);
      if (res) who.append(betEl("b", `bet-score${score > (i ? res.awayScore : res.homeScore) ? " is-win" : ""}`, String(score)));
      row.append(who);
      const btn = (type, side, line, price, label, top) => {
        const b = betEl("button", "bet-price");
        b.type = "button";
        b.disabled = Boolean(res);
        b.append(betEl("strong", "", top), betEl("small", "", betPrice(price)));
        const picked = betSlip && betSlip.game === key && betSlip.type === type && betSlip.side === side;
        if (picked) b.classList.add("is-picked");
        b.addEventListener("click", () => { betSlip = { game: key, week, type, side, line, odds: price, label }; renderBoard(); document.querySelector("#bet-stake")?.focus(); });
        return b;
      };
      row.append(
        btn("spread", team, spread, -110, `${teamName(team)} ${betLine(spread)}`, betLine(spread)),
        btn("ml", team, undefined, ml, `${teamName(team)} to win`, "ML"),
        btn("total", ou, odds.total, -110, `${ou === "over" ? "Over" : "Under"} ${odds.total} (${g.away} @ ${g.home})`, `${ou === "over" ? "O" : "U"} ${odds.total}`));
      card.append(row);
    });
    // My bets on this game
    const mine = (officeData.bets || []).filter((b) => b.member === me && b.season === season && b.week === week && b.game === key);
    if (mine.length) card.append(betEl("p", "bet-game-mine", `Your bets: ${mine.map((b) => `${betDescribe(b)} (${betMoney(b.stake)})`).join(" · ")}`));
    return card;
  }));
  renderSlip();
}
function betDescribe(b) {
  const [away, home] = b.game.split("@");
  if (b.type === "total") return `${b.side === "over" ? "Over" : "Under"} ${b.line} ${away}@${home}`;
  if (b.type === "ml") return `${b.side} ML ${betPrice(b.odds)}`;
  return `${b.side} ${betLine(b.line)}`;
}
function renderSlip() {
  const body = document.querySelector("#bet-slip-body");
  const me = betMe();
  const season = betSeason();
  if (!me) { body.replaceChildren(betEl("p", "empty-state", betMembers().length ? "Choose who you are at the top to place bets." : "Add people on the Members page first; they're the bettors.")); }
  else if (!betSlip) { body.replaceChildren(betEl("p", "empty-state", "Click a spread, moneyline or total to add it here.")); }
  else {
    const wrap = betEl("div", "bet-slip-pick");
    wrap.append(betEl("strong", "", betSlip.label), betEl("span", "", `${betSlip.type === "ml" ? "Moneyline" : betSlip.type === "spread" ? "Spread" : "Total"} · ${betPrice(betSlip.odds)}`));
    const bal = bettingBalance(officeData, me, season);
    const form = betEl("form", "bet-slip-form");
    const input = betEl("input");
    input.id = "bet-stake";
    input.inputMode = "numeric";
    input.placeholder = "Stake";
    input.setAttribute("aria-label", "Stake");
    const towin = betEl("span", "bet-towin", "To win —");
    input.addEventListener("input", () => {
      const v = Math.floor(Number(input.value.replace(/[$,\s]/g, "")));
      towin.textContent = v > 0 ? `To win ${betMoney(bettingProfit(v, betSlip.odds))}` : "To win —";
    });
    const place = betEl("button", "button button-lime", "Place bet");
    place.type = "submit";
    const cancel = betEl("button", "workspace-button", "Clear");
    cancel.type = "button";
    cancel.addEventListener("click", () => { betSlip = null; renderBoard(); });
    form.append(input, towin, place, cancel);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const stake = Math.floor(Number(input.value.replace(/[$,\s]/g, "")));
      if (!(stake > 0)) { betStatus.textContent = "Enter how much to bet."; return; }
      if (stake > bal.balance) { betStatus.textContent = `You only have ${betMoney(bal.balance)} available.`; return; }
      const [away, home] = betSlip.game.split("@");
      if (bettingResult(officeData, season, betSlip.week, away, home)) { betStatus.textContent = "That game is final; betting is closed."; return; }
      const bet = { id: newRecordId("bet"), season, week: betSlip.week, game: betSlip.game, member: me, type: betSlip.type, side: betSlip.side, odds: betSlip.odds, stake, placedAt: new Date().toISOString() };
      if (betSlip.line !== undefined) bet.line = betSlip.line;
      officeData.bets = [...(officeData.bets || []), bet];
      const label = betSlip.label;
      if (betSave(`Bet placed: ${label} for ${betMoney(stake)} (to win ${betMoney(bettingProfit(stake, bet.odds))}).`)) { betSlip = null; renderAll(); }
    });
    body.replaceChildren(wrap, form);
  }
  // My bets this week
  const list = document.querySelector("#bet-mine");
  const mine = me ? (officeData.bets || []).filter((b) => b.member === me && b.season === season && b.week === betWeek) : [];
  list.replaceChildren(...(mine.length ? mine.map((b) => {
    const s = bettingSettle(officeData, b);
    const li = betEl("li", `is-${s.status}`);
    li.append(betEl("span", "", betDescribe(b)), betEl("small", "", `${betMoney(b.stake)} · ${betPrice(b.odds)}`),
      betEl("b", "", s.status === "open" ? "OPEN" : s.status === "push" ? "PUSH" : `${s.status === "won" ? "WON" : "LOST"} ${betMoney(s.profit)}`));
    if (s.status === "open") {
      const x = betEl("button", "bet-cancel", "×");
      x.type = "button";
      x.title = "Cancel this bet (only while the game hasn't been played)";
      x.setAttribute("aria-label", x.title);
      x.addEventListener("click", () => { officeData.bets = officeData.bets.filter((y) => y.id !== b.id); if (betSave("Bet cancelled.")) renderAll(); });
      li.append(x);
    }
    return li;
  }) : [betEl("li", "bet-none", me ? "No bets this week." : "—")]));
}

// ---------- Pick'em: a weekly lineup (QB, RB, WR, TE, FLEX, D/ST) scored from the box scores ----------
const pickemLabels = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", FLEX: "FLEX", DST: "D/ST" };
const pickemFirstPos = (pos) => String(pos || "").toUpperCase().split(/[\s/,-]+/).find(Boolean) || "";
// Everyone who can fill a slot this week: main-roster players on teams playing, by position.
function pickemPool(week) {
  const season = betSeason();
  const playing = new Map();
  for (const g of betGames(week)) { playing.set(g.away, g.home); playing.set(g.home, g.away); }
  const pool = [];
  for (const [team, opp] of playing) {
    for (const player of officeData.teams[team]?.roster || []) {
      if (!isPlayerOnSeason(player, season)) continue;
      const entry = seasonEntry(player, season);
      if (isOnCel(entry) || (isPracticeSquad(entry) && !isPsElevated(entry))) continue;
      const pos = pickemFirstPos(entry.position);
      if (["QB", "RB", "HB", "FB", "WR", "TE"].includes(pos)) pool.push({ name: player.name, team, pos, opp, cap: capHitFor(entry) });
    }
  }
  return pool.sort((a, b) => b.cap - a.cap);
}
function pickemLineup(member, week) {
  return (officeData.lineups || []).find((l) => l.member === member && l.season === betSeason() && l.week === week) || null;
}
const pickemFinal = (week, team) => Boolean(team && pickemGame(officeData, betSeason(), week, team));
function renderPickem() {
  const week = betWeek, season = betSeason(), me = betMe();
  const grid = document.querySelector("#bet-pick-grid");
  if (!betGames(week).length) { grid.replaceChildren(betEl("p", "empty-state", `No games for week ${week}.`)); return; }
  if (!me) { grid.replaceChildren(betEl("p", "empty-state", betMembers().length ? "Choose who you are at the top to set your lineup." : "Add people on the Members page first; they set the lineups.")); return; }
  const lineup = pickemLineup(me, week);
  const scored = pickemLineupPoints(officeData, lineup || { season, week, slots: {} });
  const pool = pickemPool(week);
  const used = new Set(Object.entries(lineup?.slots || {}).filter(([k]) => k !== "DST").map(([, v]) => `${normalizePlayerName(v.name)}|${v.team}`));
  const card = betEl("div", "management-panel pk-card");
  const head = betEl("div", "pk-head");
  head.append(betEl("h3", "", `Week ${week} lineup`), betEl("strong", "pk-total", `${scored.total.toFixed(2)} pts`));
  card.append(head, betEl("p", "hs-help", "Pick 1 QB, 1 RB, 1 WR, 1 TE, 1 FLEX (RB, WR or TE) and 1 D/ST from teams playing this week. Each spot locks once that player's game is final. Scoring: half-point PPR (passing yard 0.04, TD 4, INT −2; rushing/receiving yard 0.1, TD 6, catch 0.5); D/ST gets sacks, takeaways, TDs and points allowed."));
  const list = betEl("div", "pk-slots");
  for (const [slot, positions] of pickemSlots) {
    const row = betEl("div", "pk-slot");
    row.append(betEl("b", "pk-slot-label", pickemLabels[slot]));
    const pick = lineup?.slots?.[slot];
    const pickTeam = slot === "DST" ? pick : pick?.team;
    const locked = pickemFinal(week, pickTeam);
    const info = betEl("div", "pk-slot-info");
    if (pick) {
      const s = scored.slots[slot];
      const name = slot === "DST" ? `${teamName(pick)} D/ST` : `${pick.name}`;
      info.append(betLogo(pickTeam), betEl("span", "pk-slot-name", name), betEl("small", "", slot === "DST" ? "" : `${pick.pos || ""} · ${pick.team}`));
      if (s?.played) info.append(betEl("small", "pk-slot-line", s.line));
      row.append(info, betEl("strong", `pk-slot-pts${s?.played ? "" : " is-pending"}`, s?.played ? s.points.toFixed(2) : "—"));
    } else { info.append(betEl("span", "pk-slot-empty", "Empty")); row.append(info, betEl("strong", "pk-slot-pts is-pending", "—")); }
    if (!locked) {
      const sel = betEl("select", "pk-select");
      sel.setAttribute("aria-label", `Choose your ${pickemLabels[slot]}`);
      sel.append(new Option(pick ? "Change…" : "Choose…", ""));
      if (slot === "DST") {
        for (const g of betGames(week)) for (const [t, o] of [[g.away, g.home], [g.home, g.away]]) if (!pickemFinal(week, t)) sel.append(new Option(`${teamName(t)} D/ST (vs ${o})`, `DST|${t}`));
      } else {
        for (const p of pool) {
          if (!positions.includes(p.pos) || pickemFinal(week, p.team)) continue;
          const key = `${normalizePlayerName(p.name)}|${p.team}`;
          if (used.has(key) && !(pick && normalizePlayerName(pick.name) === normalizePlayerName(p.name) && pick.team === p.team)) continue;
          sel.append(new Option(`${p.name} · ${p.pos} · ${p.team} vs ${p.opp}`, `${p.team}|${p.pos}|${p.name}`));
        }
      }
      sel.addEventListener("change", () => {
        if (!sel.value) return;
        const all = (officeData.lineups || []).filter((l) => !(l.member === me && l.season === season && l.week === week));
        const slots = { ...(lineup?.slots || {}) };
        if (slot === "DST") slots.DST = sel.value.split("|")[1];
        else { const [team, pos, ...rest] = sel.value.split("|"); slots[slot] = { name: rest.join("|"), team, pos }; }
        officeData.lineups = [...all, { season, week, member: me, slots }];
        if (betSave(`${pickemLabels[slot]}: ${slot === "DST" ? `${teamName(slots.DST)} D/ST` : slots[slot].name}.`)) renderPickem();
      });
      row.append(sel);
    } else row.append(betEl("span", "pk-lock", "LOCKED"));
    list.append(row);
  }
  card.append(list);
  // This week's scores for everyone
  const others = betMembers().map((m) => ({ m, l: pickemLineup(m.id, week) })).filter((x) => x.l)
    .map((x) => ({ ...x, pts: pickemLineupPoints(officeData, x.l).total })).sort((a, b) => b.pts - a.pts);
  const side = betEl("div", "management-panel pk-week");
  side.append(betEl("h3", "", `Week ${week} scores`));
  const ol = betEl("ol", "pk-week-list");
  ol.append(...(others.length ? others.map((x) => { const li = betEl("li", x.m.id === me ? "is-me" : ""); li.append(betEl("span", "", x.m.name), betEl("b", "", x.pts.toFixed(2))); return li; }) : [betEl("li", "bet-none", "No lineups yet.")]));
  side.append(ol);
  grid.replaceChildren(card, side);
}

// ---------- Leaderboards ----------
function renderLeaders() {
  const season = betSeason();
  const members = betMembers();
  const money = members.map((m) => ({ m, ...bettingBalance(officeData, m.id, season) })).sort((a, b) => b.balance + b.open - (a.balance + a.open));
  document.querySelector("#bet-lb-money").replaceChildren(...(money.length ? money.map((r, i) => {
    const tr = document.createElement("tr");
    for (const v of [String(i + 1), r.m.name, betMoney(r.settled), `${r.won}-${r.lost}-${r.pushes}`, r.open ? betMoney(r.open) : "—"]) tr.insertCell().textContent = v;
    tr.cells[2].className = r.settled >= r.start ? "bet-up" : "bet-down";
    return tr;
  }) : [Object.assign(document.createElement("tr"), { innerHTML: '<td colspan="5" class="empty-state">No members yet.</td>' })]));
  const picks = members.map((m) => {
    let total = 0, weeks = 0, week = 0;
    for (const l of (officeData.lineups || []).filter((x) => x.member === m.id && x.season === season)) {
      const pts = pickemLineupPoints(officeData, l).total;
      total += pts;
      if (Object.values(pickemLineupPoints(officeData, l).slots).some((x) => x.played)) weeks += 1;
      if (l.week === betWeek) week = pts;
    }
    return { m, total: Math.round(total * 100) / 100, weeks, week };
  }).sort((a, b) => b.total - a.total);
  document.querySelector("#bet-lb-picks").replaceChildren(...(picks.length ? picks.map((r, i) => {
    const tr = document.createElement("tr");
    for (const v of [String(i + 1), r.m.name, r.total.toFixed(2), String(r.weeks), r.week ? r.week.toFixed(2) : "—"]) tr.insertCell().textContent = v;
    return tr;
  }) : [Object.assign(document.createElement("tr"), { innerHTML: '<td colspan="5" class="empty-state">No members yet.</td>' })]));
}

// ---------- Page ----------
function renderAll() {
  const members = betMembers();
  const sel = document.querySelector("#bet-member");
  const me = betMe();
  sel.replaceChildren(new Option(members.length ? "Choose your name" : "No members yet", ""), ...members.map((m) => new Option(`${m.name}${m.teamId ? ` (${m.teamId})` : ""}`, m.id)));
  sel.value = me;
  const balance = document.querySelector("#bet-balance");
  if (me) {
    const b = bettingBalance(officeData, me, betSeason());
    balance.replaceChildren(betEl("strong", "", betMoney(b.balance)), betEl("small", "", `available${b.open ? ` · ${betMoney(b.open)} riding` : ""}`));
  } else balance.replaceChildren();
  const weeks = betWeeks();
  const current = leagueCurrentWeek(officeData).week;
  if (betWeek === null) betWeek = weeks.includes(current) ? current : weeks.find((w) => w >= current) ?? weeks[weeks.length - 1] ?? current;
  const wk = document.querySelector("#bet-week");
  const list = weeks.length ? weeks : [betWeek];
  wk.replaceChildren(...list.map((w) => new Option(`${w > 18 ? "Playoffs " : "Week "}${w}${w === current ? " (this week)" : ""}`, String(w))));
  wk.value = String(betWeek);
  document.querySelector("#bet-start").value = (officeData.bettingSettings?.startingBalance ?? bettingDefaultBalance).toLocaleString("en-US");
  if (betView === "board") renderBoard();
  if (betView === "pickem") renderPickem();
  if (betView === "leaders") renderLeaders();
}
document.querySelector("#bet-member").addEventListener("change", (event) => {
  try { if (event.target.value) localStorage.setItem(betMemberKey, event.target.value); else localStorage.removeItem(betMemberKey); } catch { /* fine */ }
  betSlip = null;
  renderAll();
});
document.querySelector("#bet-week").addEventListener("change", (event) => { betWeek = Number(event.target.value); betSlip = null; renderAll(); });
document.querySelector(".bet-tabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-view]");
  if (!tab) return;
  betView = tab.dataset.view;
  document.querySelectorAll(".bet-tabs [data-view]").forEach((t) => { t.classList.toggle("is-active", t === tab); t.setAttribute("aria-selected", String(t === tab)); });
  for (const v of ["board", "pickem", "leaders"]) document.querySelector(`#bet-view-${v}`).hidden = v !== betView;
  renderAll();
});
document.querySelector("#bet-start-save").addEventListener("click", () => {
  const v = Math.floor(Number(document.querySelector("#bet-start").value.replace(/[$,\s]/g, "")));
  if (!Number.isFinite(v) || v < 0) { betStatus.textContent = "Enter a whole dollar amount, like 1,000."; return; }
  officeData.bettingSettings = { ...(officeData.bettingSettings || {}), startingBalance: v };
  if (betSave(`Starting balance set to ${betMoney(v)}.`)) renderAll();
});
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { officeData = readStoredOffice() || emptyOfficeData(); renderAll(); } catch { /* keep the last view */ }
});
renderAll();
