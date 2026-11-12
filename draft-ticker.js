// The draft ticker: a broadcast-style band fixed to the bottom of the screen on every page while this year's draft is live (started from
// Season Information › Draft, or by its first pick) and until every pick is in. Top row: the league's draft mark, the
// team on the clock with its round and pick, the draft title with the last pick, and the pick clock. Then the next
// teams up, and a crawl of the picks made so far. The pick clock is mirrored from the draft room through localStorage
// (nbf-draft-clock), so it counts down on every page and tab. Uses league-core.js and teams.js.
(function draftTicker() {
  const clockKey = "nbf-draft-clock";
  const revealMs = 5000; // "the pick is in"
  const tradeMs = 10000; // TRADE header
  let revealTimer = null;
  let data = null;
  let tickTimer = null;

  const read = () => { try { return readStoredOffice() || null; } catch { return null; } };
  const year = () => currentLeagueYear();
  const logoUrl = (id) => `https://a.espncdn.com/i/teamlogos/nfl/500/${nflTeams.find((t) => t.id === id)?.logo || id.toLowerCase()}.png`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const teamColor = (id) => (typeof teamThemePalettes === "object" && teamThemePalettes[id] ? teamThemePalettes[id][0] : "#0c2b50");

  function state() {
    if (!data || data.draftLive !== year()) return null;
    const order = draftOrderFor(data, year()); // open picks' teams come from Draft Pick Manager
    if (!order.length) return null;
    const picks = (data.draftHistory || []).filter((d) => d.year === year());
    const made = new Map(picks.map((d) => [d.pick, d]));
    const left = order.filter((s) => !made.has(s.pick));
    if (!left.length && !picks.some((d) => d.madeAt && Date.parse(d.madeAt) + revealMs > Date.now())) return null; // the draft is over
    const onClock = left.find((s) => !s.skipped) || null;
    const byTime = [...picks].sort((a, b) => String(a.madeAt || "").localeCompare(String(b.madeAt || "")) || a.pick - b.pick);
    // "The pick is in": for 5 seconds after a pick, the ticker announces it before showing who was taken.
    const newest = byTime[byTime.length - 1];
    const revealAt = newest?.madeAt ? Date.parse(newest.madeAt) + revealMs : 0;
    const pending = revealAt > Date.now() ? newest : null;
    const shown = pending ? byTime.slice(0, -1) : byTime;
    // A draft-day trade shows the same way, as a TRADE header, unless a pick came in after it.
    const lastTrade = (data.draftTrades || []).filter((t) => t.year === year()).sort((a, b) => a.at.localeCompare(b.at)).pop();
    const tradeUntil = lastTrade ? Date.parse(lastTrade.at) + tradeMs : 0;
    const trade = tradeUntil > Date.now() && !(pending && Date.parse(pending.madeAt) > Date.parse(lastTrade.at)) ? lastTrade : null;
    return { order, picks: shown, onClock, pending: trade ? null : pending, trade, revealAt: trade ? tradeUntil : revealAt, skipped: left.filter((s) => s.skipped), next: left.filter((s) => !s.skipped && s !== onClock).slice(0, 16), last: shown[shown.length - 1] };
  }

  function clockText() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(clockKey) || "null"); } catch { saved = null; }
    const s = state();
    if (!saved || !s?.onClock || saved.pick !== s.onClock.pick || saved.year !== year()) return null;
    const left = Math.max(0, Math.round(saved.running ? saved.left - (Date.now() - saved.at) / 1000 : saved.left));
    return { text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, left, running: saved.running };
  }

  function render() {
    data = read();
    const s = state();
    let bar = document.querySelector(".draft-ticker");
    document.documentElement.classList.toggle("draft-live", Boolean(s));
    if (!s) { bar?.remove(); clearInterval(tickTimer); tickTimer = null; clearTimeout(revealTimer); return; }
    if (!bar) {
      bar = el("a", "draft-ticker");
      bar.href = "draft.html";
      bar.setAttribute("aria-label", "Draft ticker: open the draft room");
      (document.querySelector("main") || document.body).prepend(bar);
    }
    const y = year();
    // Brand
    const brand = el("div", "dt-brand");
    const logo = el("img");
    logo.src = "assets/nothing-but-nfl-logo.png";
    logo.alt = "";
    brand.append(logo, Object.assign(el("span"), { innerHTML: "NBNFL<b>DRAFT</b>" }));
    // On the clock
    const clock = el("div", "dt-clock");
    const nickname = (id) => teamName(id).split(" ").pop().toUpperCase();
    if (s.trade) {
      // A pick changing hands: the pick number over a gold TRADE bar.
      clock.classList.add("is-pick-in");
      clock.style.setProperty("--dt-team", teamColor(s.trade.toTeam));
      const stack = el("div", "dt-pickin-stack");
      stack.append(el("strong", "dt-pickin-team", `PICK ${s.trade.pick}`), el("span", "dt-pickin-bar", "TRADE"));
      const who = el("div", "dt-clock-who");
      who.append(el("strong", "", `${s.trade.fromTeam} ▸ ${s.trade.toTeam}`), el("span", "", `ROUND ${s.trade.round}`));
      clock.append(stack, who);
    } else if (s.pending) {
      // "The pick is in" (like a broadcast): the team's name over a gold PICK IS IN bar.
      clock.classList.add("is-pick-in");
      clock.style.setProperty("--dt-team", teamColor(s.pending.teamId));
      const stack = el("div", "dt-pickin-stack");
      stack.append(el("strong", "dt-pickin-team", nickname(s.pending.teamId)), el("span", "dt-pickin-bar", "PICK IS IN"));
      const who = el("div", "dt-clock-who");
      who.append(el("strong", "", s.pending.teamId), el("span", "", `RD${s.pending.round} PK${s.pending.pick}${s.pending.compensatory ? "*" : ""}`));
      clock.append(stack, who);
    } else if (s.onClock) {
      clock.style.setProperty("--dt-team", teamColor(s.onClock.teamId));
      const tl = el("img");
      tl.src = logoUrl(s.onClock.teamId);
      tl.alt = "";
      tl.addEventListener("error", () => tl.remove(), { once: true });
      const words = el("div", "dt-clock-words");
      words.append(el("span", "dt-clock-label", "ON THE"), el("span", "dt-clock-label", "CLOCK"));
      const who = el("div", "dt-clock-who");
      who.append(el("strong", "", s.onClock.teamId), el("span", "", `RD${s.onClock.round} PK${s.onClock.pick}${s.onClock.compensatory ? "*" : ""}`));
      const logoBox = el("div", "dt-clock-logo");
      logoBox.append(tl, el("b", "", s.onClock.teamId));
      clock.append(logoBox, words, who);
    } else {
      clock.append(el("div", "dt-clock-words", "WAITING ON SKIPPED TEAMS"));
    }
    // Title (while a pick is in: "[TEAM] SELECTION" across the whole middle, up to the pick clock)
    const selection = s.pending || s.trade ? el("div", "dt-selection") : null;
    if (selection && s.trade) {
      // [team giving the pick up]  TRADE  [team getting it]
      selection.classList.add("is-trade");
      selection.style.setProperty("--dt-team", teamColor(s.trade.toTeam));
      selection.style.setProperty("--dt-from", teamColor(s.trade.fromTeam));
      const mark = (id) => { const box = el("span", "dt-selection-logo"); const img = el("img"); img.src = logoUrl(id); img.alt = ""; img.addEventListener("error", () => { img.remove(); box.textContent = id; }, { once: true }); box.append(img); return box; };
      // Each side: logo, team, and what that team gets in the trade.
      const side = (id, align) => {
        const wrap = el("span", `dt-trade-side is-${align}`);
        const text = el("span", "dt-trade-text");
        const got = (s.trade.gets && s.trade.gets[id]) || [];
        text.append(el("small", "", nickname(id)), el("em", "", got.length ? `GETS ${got.join(" · ")}` : `SENDS PICK ${s.trade.pick}`));
        wrap.append(mark(id), text);
        return wrap;
      };
      selection.append(side(s.trade.fromTeam, "left"), el("strong", "", "TRADE"), side(s.trade.toTeam, "right"));
    } else if (selection) {
      selection.style.setProperty("--dt-team", teamColor(s.pending.teamId));
      const mark = () => { const box = el("span", "dt-selection-logo"); const img = el("img"); img.src = logoUrl(s.pending.teamId); img.alt = ""; img.addEventListener("error", () => { img.remove(); box.textContent = s.pending.teamId; }, { once: true }); box.append(img); return box; };
      selection.append(mark(), el("strong", "", `${nickname(s.pending.teamId)} SELECTION`), mark());
    }
    const title = el("div", "dt-title");
    const main = el("div", "dt-title-main");
    main.append(el("strong", "", `${y} NBNFL DRAFT`), el("span", "", s.pending ? `ROUND ${s.pending.round}` : s.onClock ? `ROUND ${s.onClock.round}` : "LATE PICKS"));
    const sub = el("div", "dt-title-sub", s.pending ? `THE ${teamName(s.pending.teamId).toUpperCase()} HAVE MADE THEIR SELECTION AT PICK ${s.pending.pick}…` : s.last
      ? `LAST PICK · #${s.last.pick} ${s.last.teamId} · ${s.last.player}${s.last.position ? `, ${s.last.position}` : ""}${s.last.college ? ` · ${s.last.college}` : ""}`
      : "THE DRAFT IS UNDERWAY");
    title.append(main, sub);
    // Clock / status
    const right = el("div", "dt-right");
    const c = clockText();
    right.append(el("strong", `dt-time${c && c.left <= 10 ? " is-low" : ""}`, c ? c.text : "LIVE"), el("span", "", c ? (c.running ? "ON THE CLOCK" : "CLOCK PAUSED") : `${s.picks.length} OF ${s.order.length} PICKS IN`));
    // Next
    const next = el("div", "dt-next");
    next.append(el("span", "dt-next-label", "NEXT ▸"), ...s.next.map((n) => el("span", "dt-next-team", `${n.teamId}${n.compensatory ? "*" : ""}`)));
    if (s.skipped.length) next.append(el("span", "dt-next-label dt-skipped", `SKIPPED ▸ ${s.skipped.map((k) => k.teamId).join(" ")}`));
    // Crawl: the current round, pick by pick — "ROUND 1", then every pick of the round in order (the player for picks
    // made, ON THE CLOCK, SKIPPED, or just the team for picks to come), then back to the round's first pick. When the
    // round is finished it moves on to "ROUND 2", and so on to the end of the draft.
    const crawl = el("div", "dt-crawl");
    const label = el("span", "dt-crawl-label", "THE PICKS");
    const track = el("div", "dt-crawl-track");
    const round = (s.pending || s.onClock || s.skipped[0] || s.order[s.order.length - 1]).round;
    const madeMap = new Map(s.picks.map((p) => [p.pick, p]));
    const items = [el("span", "dt-crawl-item dt-crawl-round", `ROUND ${round}`), ...s.order.filter((slot) => slot.round === round).map((slot) => {
      const item = el("span", "dt-crawl-item");
      const made = madeMap.get(slot.pick);
      item.append(el("b", "", `${slot.pick}${slot.compensatory ? "*" : ""}. ${slot.teamId}`));
      if (made) item.append(` ${made.player}${made.position ? `, ${made.position}` : ""}${made.college ? ` (${made.college})` : ""}`);
      else if (s.pending && s.pending.pick === slot.pick) item.append(el("em", "dt-crawl-tag is-in", "THE PICK IS IN"));
      else if (s.onClock && s.onClock.pick === slot.pick) item.append(el("em", "dt-crawl-tag", "ON THE CLOCK"));
      else if (slot.skipped) item.append(el("em", "dt-crawl-tag is-skipped", "SKIPPED"));
      if (!made) item.classList.add("is-open");
      return item;
    })];
    const run = el("div", "dt-crawl-run");
    run.append(...items, ...items.map((i) => i.cloneNode(true))); // doubled for a seamless loop
    run.style.animationDuration = `${Math.max(25, items.length * 6)}s`;
    track.append(run);
    crawl.append(label, track);
    const top = el("div", "dt-top");
    top.append(brand, clock, selection || title, right);
    bar.replaceChildren(top, next, crawl);
    clearTimeout(revealTimer);
    if (s.pending || s.trade) revealTimer = setTimeout(render, Math.max(50, s.revealAt - Date.now() + 30));
    if (!tickTimer) tickTimer = setInterval(() => {
      const t = bar.querySelector(".dt-time");
      const now = clockText();
      if (t && now) {
        t.textContent = now.text;
        t.classList.toggle("is-low", now.left <= 10);
        t.nextElementSibling.textContent = now.running ? "ON THE CLOCK" : "CLOCK PAUSED";
      }
    }, 1000);
  }

  // Trade sound: plays on whichever page shows the TRADE header first (approving a trade on Pending Trades, a trade in
  // the draft room or Draft Pick Manager), once per trade across open tabs, and only while the draft is live. Uses the
  // draft room's sound settings: on/off and volume (localStorage) and a custom file if one was chosen (IndexedDB).
  const tradeSoundKey = "nbf-draft-trade-sound-played";
  let audioCtx = null;
  function beep(freq, length, type, volume) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    audioCtx = audioCtx || new C();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.5 * volume), t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
  function customTradeSound() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("nbf-draft-sound", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("files");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const get = req.result.transaction("files", "readonly").objectStore("files").get("trade");
            get.onsuccess = () => resolve(get.result || null);
            get.onerror = () => resolve(null);
          } catch { resolve(null); }
        };
      } catch { resolve(null); }
    });
  }
  async function playTradeSound(trade) {
    try {
      if (localStorage.getItem("nbf-draft-sound-trade") === "off") return;
      // Only one open tab plays it: each tab claims the trade, waits a moment, and plays only if its claim is the one left.
      if (String(localStorage.getItem(tradeSoundKey) || "").startsWith(`${trade.id}:`)) return;
      const token = `${trade.id}:${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(tradeSoundKey, token);
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (localStorage.getItem(tradeSoundKey) !== token) return;
    } catch { /* play anyway */ }
    let volume = 0.8;
    try { const saved = JSON.parse(localStorage.getItem("nbf-draft-sound") || "null"); if (Number.isFinite(saved?.volume)) volume = saved.volume; } catch { /* default */ }
    const file = await customTradeSound();
    if (file) {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.volume = volume;
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      audio.play().catch(() => {});
      return;
    }
    beep(392, 0.18, "square", volume);
    setTimeout(() => beep(587.33, 0.18, "square", volume), 160);
    setTimeout(() => { beep(783.99, 0.9, "triangle", volume); beep(1174.66, 0.6, "sine", volume); }, 330);
  }
  let lastAnnounced = null;
  const baseRender = render;
  render = function renderWithSound() {
    baseRender();
    const s = state();
    if (s?.trade && s.trade.id !== lastAnnounced && Date.now() - Date.parse(s.trade.at) < 3000) {
      lastAnnounced = s.trade.id;
      playTradeSound(s.trade);
    }
  };

  window.renderDraftTicker = render;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
  window.addEventListener("storage", (event) => { if (event.key === officeStorageKey || event.key === clockKey) render(); });
})();
