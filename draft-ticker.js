// The draft ticker: a broadcast-style band across the top of every page while this year's draft is live (started from
// Season Information › Draft, or by its first pick) and until every pick is in. Top row: the league's draft mark, the
// team on the clock with its round and pick, the draft title with the last pick, and the pick clock. Then the next
// teams up, and a crawl of the picks made so far. The pick clock is mirrored from the draft room through localStorage
// (nbf-draft-clock), so it counts down on every page and tab. Uses league-core.js and teams.js.
(function draftTicker() {
  const clockKey = "nbf-draft-clock";
  let data = null;
  let tickTimer = null;

  const read = () => { try { return readStoredOffice() || null; } catch { return null; } };
  const year = () => currentLeagueYear();
  const logoUrl = (id) => `https://a.espncdn.com/i/teamlogos/nfl/500/${nflTeams.find((t) => t.id === id)?.logo || id.toLowerCase()}.png`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const teamColor = (id) => (typeof teamThemePalettes === "object" && teamThemePalettes[id] ? teamThemePalettes[id][0] : "#0c2b50");

  function state() {
    if (!data || data.draftLive !== year()) return null;
    const order = (data.draftOrder || []).filter((d) => d.year === year()).sort((a, b) => a.pick - b.pick);
    if (!order.length) return null;
    const picks = (data.draftHistory || []).filter((d) => d.year === year());
    const made = new Map(picks.map((d) => [d.pick, d]));
    const left = order.filter((s) => !made.has(s.pick));
    if (!left.length) return null; // the draft is over
    const onClock = left.find((s) => !s.skipped) || null;
    const byTime = [...picks].sort((a, b) => String(a.madeAt || "").localeCompare(String(b.madeAt || "")) || a.pick - b.pick);
    return { order, picks: byTime, onClock, skipped: left.filter((s) => s.skipped), next: left.filter((s) => !s.skipped && s !== onClock).slice(0, 16), last: byTime[byTime.length - 1] };
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
    if (!s) { bar?.remove(); clearInterval(tickTimer); tickTimer = null; return; }
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
    if (s.onClock) {
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
    // Title
    const title = el("div", "dt-title");
    const main = el("div", "dt-title-main");
    main.append(el("strong", "", `${y} NBNFL DRAFT`), el("span", "", s.onClock ? `ROUND ${s.onClock.round}` : "LATE PICKS"));
    const sub = el("div", "dt-title-sub", s.last
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
    // Crawl of picks made
    const crawl = el("div", "dt-crawl");
    const label = el("span", "dt-crawl-label", "THE PICKS");
    const track = el("div", "dt-crawl-track");
    const items = (s.picks.length ? s.picks : [{ pick: 0 }]).map((p) => {
      if (!p.pick) return el("span", "dt-crawl-item", `${y} NBNFL Draft · Round 1 is on the clock · Follow every pick in the Draft room`);
      const item = el("span", "dt-crawl-item");
      item.append(el("b", "", `${p.pick}${p.compensatory ? "*" : ""}. ${p.teamId}`), ` ${p.player}${p.position ? `, ${p.position}` : ""}${p.college ? ` (${p.college})` : ""}`);
      return item;
    });
    const run = el("div", "dt-crawl-run");
    run.append(...items, ...items.map((i) => i.cloneNode(true))); // doubled for a seamless loop
    run.style.animationDuration = `${Math.max(25, items.length * 6)}s`;
    track.append(run);
    crawl.append(label, track);
    const top = el("div", "dt-top");
    top.append(brand, clock, title, right);
    bar.replaceChildren(top, next, crawl);
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

  window.renderDraftTicker = render;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
  window.addEventListener("storage", (event) => { if (event.key === officeStorageKey || event.key === clockKey) render(); });
})();
