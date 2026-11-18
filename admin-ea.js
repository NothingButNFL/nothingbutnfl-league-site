// Admin › Madden ratings from EA: reads ea-ratings.json (written by tools/ea_ratings.py, kept up to date by the
// "EA Madden ratings" GitHub Action) and fills every team's Player Ratings with it. Opening the site from files on
// your computer can't read it automatically, so "Load ea-ratings.json…" takes the file instead.
(() => {
  const status = document.querySelector("#ea-status");
  const summary = document.querySelector("#ea-summary");
  if (!status) return;
  const season = () => (seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0]);

  function showSummary() {
    let data;
    try { data = readStoredOffice() || emptyOfficeData(); } catch { data = emptyOfficeData(); }
    const info = data.ratings?.[season()]?.ea;
    if (!info) { summary.innerHTML = '<p class="empty-state">No EA ratings loaded yet this season.</p>'; return; }
    const when = new Date(info.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    summary.replaceChildren();
    const p = document.createElement("p");
    p.className = "ea-summary-line";
    p.textContent = `Last updated ${when}: ${info.labels.join(", ")}. ${info.matched} players matched.`;
    summary.append(p);
    // Players it couldn't match on its own: pick the right EA player (or "not in Madden") from a list.
    const review = info.review || [];
    for (const [kind, title, help] of [["ambiguous", "Same name in Madden", "More than one Madden player has this name. Pick the right one."],
      ["unmatched", "Not found in Madden", "No Madden player with this name. If he's listed under another spelling, pick him; otherwise mark him not in Madden."]]) {
      const rows = review.filter((r) => r.kind === kind);
      if (!rows.length) continue;
      const details = document.createElement("details");
      details.className = "ea-missing";
      details.open = kind === "ambiguous";
      const sum = document.createElement("summary");
      sum.textContent = `${title} (${rows.length})`;
      const note = document.createElement("p");
      note.textContent = help;
      const list = document.createElement("div");
      list.className = "ea-review";
      for (const r of rows) {
        const label = document.createElement("label");
        label.textContent = r.label;
        const select = document.createElement("select");
        select.dataset.playerId = r.playerId;
        select.append(new Option(r.options.length ? "Choose the Madden player…" : "No Madden player with that last name", ""));
        for (const [id, text] of r.options) select.append(new Option(text, id));
        select.append(new Option("Not in Madden (skip him)", "__none"));
        label.append(select);
        list.append(label);
      }
      details.append(sum, note, list);
      summary.append(details);
    }
    const withId = Object.values(data.teams || {}).flatMap((t) => t.roster).filter((p) => p.profile?.maddenId).length;
    const skipped = Object.values(data.ratings?.[season()]?.links || {}).filter((v) => v === "").length;
    if (withId || skipped) {
      const p2 = document.createElement("p");
      p2.className = "ea-summary-line";
      p2.textContent = `${withId} players on salary sheets have a Madden ID saved on their profile${skipped ? `; ${skipped} marked not in Madden` : ""}. `;
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "workspace-button";
      clear.id = "ea-clear-links";
      clear.textContent = "Clear Madden IDs";
      p2.append(clear);
      summary.append(p2);
    }
  }

  let lastEa = null; // the EA file loaded on this visit, so a hand match applies right away

  function apply(ea) {
    lastEa = ea;
    let data;
    try { data = readStoredOffice() || emptyOfficeData(); } catch { data = emptyOfficeData(); }
    const result = applyEaRatings(data, ea, season());
    if (result.error) { status.textContent = result.error; return; }
    try { writeStoredOffice(data); } catch (error) { status.textContent = `Could not save: ${error.message}.`; return; }
    if (typeof officeData !== "undefined") officeData = data; // admin.js's copy, so its cap boxes don't save over this
    status.textContent = `Ratings updated through ${result.releases[result.releases.length - 1]}: ${result.matched} players matched` +
      `${result.unmatched.length ? `, ${result.unmatched.length} not found` : ""}${result.ambiguous.length ? `, ${result.ambiguous.length} with duplicate names` : ""}.`;
    showSummary();
  }

  document.querySelector("#ea-update").addEventListener("click", async () => {
    status.textContent = "Loading EA ratings…";
    try {
      const response = await fetch(`ea-ratings.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "ea-ratings.json isn't on the site yet" : `HTTP ${response.status}`);
      apply(await response.json());
    } catch (error) {
      status.textContent = location.protocol === "file:"
        ? "This page is open from files on your computer, so it can't read ea-ratings.json by itself. Use \"Load ea-ratings.json…\" and pick the file in your site folder."
        : `Couldn't load EA ratings (${error.message}). Press "Fetch from EA now (GitHub)" and run the workflow, wait for it to finish, then try again.`;
    }
  });

  document.querySelector("#ea-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { apply(JSON.parse(await file.text())); } catch { status.textContent = "That file isn't valid JSON."; }
  });

  // Hand matches: save the link, then re-apply the loaded EA file (or ask for it).
  summary.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-player-id]");
    if (!select || !select.value) return;
    let data;
    try { data = readStoredOffice() || emptyOfficeData(); } catch { return; }
    const s = ratingsSeason(data, season(), true);
    s.links ||= {};
    const found = findPlayerById(data, select.dataset.playerId);
    if (select.value === "__none") { s.links[select.dataset.playerId] = ""; if (found?.player.profile) delete found.player.profile.maddenId; }
    else if (found) { found.player.profile = { ...(found.player.profile || {}), maddenId: select.value }; delete s.links[select.dataset.playerId]; }
    try { writeStoredOffice(data); } catch (error) { status.textContent = `Could not save: ${error.message}.`; return; }
    if (typeof officeData !== "undefined") officeData = data;
    if (lastEa) apply(lastEa);
    else { status.textContent = "Madden ID saved on his profile. Press \"Update ratings from EA\" to fill in his ratings."; showSummary(); }
  });
  summary.addEventListener("click", (event) => {
    if (event.target.id !== "ea-clear-links") return;
    let data;
    try { data = readStoredOffice() || emptyOfficeData(); } catch { return; }
    if (data.ratings?.[season()]) data.ratings[season()].links = {};
    for (const p of [...Object.values(data.teams || {}).flatMap((t) => t.roster), ...(data.contractPlayers || [])]) if (p.profile?.maddenId) delete p.profile.maddenId;
    try { writeStoredOffice(data); } catch (error) { status.textContent = `Could not save: ${error.message}.`; return; }
    if (typeof officeData !== "undefined") officeData = data;
    if (lastEa) apply(lastEa); else { status.textContent = "Madden IDs cleared; the next update matches everyone by name again."; showSummary(); }
  });

  showSummary();
})();
