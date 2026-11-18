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
    for (const [list, title] of [[info.unmatched, "Not found in EA's ratings"], [info.ambiguous, "More than one EA player with this name"]]) {
      if (!list?.length) continue;
      const details = document.createElement("details");
      details.className = "ea-missing";
      const sum = document.createElement("summary");
      sum.textContent = `${title} (${list.length})`;
      const body = document.createElement("p");
      body.textContent = list.join(" · ");
      details.append(sum, body);
      summary.append(details);
    }
  }

  function apply(ea) {
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

  showSummary();
})();
