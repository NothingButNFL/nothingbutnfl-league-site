// Super Bowl Champions. Entries live in officeData.championships (league-core.js).
const sbRows = document.querySelector("#sb-rows");
const sbStatus = document.querySelector("#sb-status");
const sbNotice = document.querySelector("#sb-storage-notice");
const sbForm = document.querySelector("#sb-form");
const sbBoxScore = document.querySelector("#sb-boxscore");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  sbNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.championships)) officeData.championships = [];

const thisSeason = () => officeData.standings?.season || currentLeagueYear();

function save(message) {
  try {
    writeStoredOffice(officeData);
    sbStatus.textContent = message;
  } catch (error) {
    sbStatus.textContent = `Could not save: ${error.message}.`;
  }
}

const byNewest = () => [...officeData.championships].sort((a, b) => b.season - a.season);
const hasScore = (entry) => entry.championScore !== undefined && entry.runnerUpScore !== undefined;
const scoreText = (entry) => hasScore(entry) ? `${entry.championScore}–${entry.runnerUpScore}` : "";

function teamLogo(teamId, className) {
  const team = nflTeams.find(({ id }) => id === teamId);
  const wrap = document.createElement("span");
  wrap.className = className;
  wrap.setAttribute("aria-hidden", "true");
  const fallback = document.createElement("span");
  fallback.className = "sb-logo-fallback";
  fallback.textContent = teamId;
  fallback.hidden = true;
  const image = document.createElement("img");
  image.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team.logo}.png`;
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", () => { image.hidden = true; fallback.hidden = false; }, { once: true });
  wrap.append(image, fallback);
  return wrap;
}

function teamLink(teamId) {
  const link = document.createElement("a");
  link.className = "sb-team";
  link.href = `team.html?team=${encodeURIComponent(teamId)}`;
  const code = document.createElement("b");
  code.textContent = teamId;
  link.append(code, teamName(teamId));
  return link;
}

// MVP name (linked to their profile when known), position, and stat line.
function mvpNode(entry) {
  const wrap = document.createElement("span");
  wrap.className = "sb-mvp-line";
  const head = document.createElement("span");
  head.className = "sb-mvp-name";
  const found = findPlayerByName(officeData, entry.mvp, entry.champion);
  const name = found ? document.createElement("a") : document.createElement("strong");
  if (found) { name.className = "player-name-link"; name.href = profileUrl(found.player.id); }
  name.textContent = entry.mvp;
  head.append(name);
  if (entry.mvpPosition) {
    const pos = document.createElement("span");
    pos.className = "sb-mvp-pos";
    pos.textContent = entry.mvpPosition;
    head.append(pos);
  }
  wrap.append(head);
  if (statTiles(entry.mvpLine).length) {
    wrap.append(statTilesNode(entry.mvpLine));
  } else if (entry.mvpStats) {
    const stats = document.createElement("span");
    stats.className = "sb-mvp-stats";
    stats.textContent = entry.mvpStats;
    wrap.append(stats);
  }
  return wrap;
}

function titleCount(teamId, upTo) {
  return officeData.championships.filter((c) => c.champion === teamId && c.season <= upTo).length;
}

function renderLatest() {
  const box = document.querySelector("#sb-latest");
  const [latest] = byNewest();
  if (!latest) {
    box.className = "sb-latest is-empty";
    box.textContent = "No champions yet. Add the first one below. You can add past seasons too.";
    return;
  }
  box.className = "sb-latest";
  const text = document.createElement("div");
  text.className = "sb-latest-text";
  const kicker = document.createElement("span");
  kicker.className = "sb-latest-kicker";
  kicker.textContent = latest.season === thisSeason() ? `REIGNING CHAMPION · ${latest.season}` : `MOST RECENT CHAMPION · ${latest.season}`;
  const name = document.createElement("strong");
  name.textContent = teamName(latest.champion);
  const detail = document.createElement("p");
  const count = titleCount(latest.champion, latest.season);
  const parts = [];
  if (latest.runnerUp) parts.push(`Beat the ${teamName(latest.runnerUp)}${hasScore(latest) ? ` ${scoreText(latest)}` : ""}`);
  else if (hasScore(latest)) parts.push(`Won ${scoreText(latest)}`);
  if (latest.gm) parts.push(`GM ${latest.gm}`);
  parts.push(count === 1 ? "First league title" : `League title No. ${count}`);
  detail.textContent = parts.join(" · ");
  text.append(kicker, name, detail);
  if (latest.mvp) {
    const mvp = document.createElement("div");
    mvp.className = "sb-latest-mvp";
    const tag = document.createElement("b");
    tag.textContent = "SB MVP";
    mvp.append(tag, mvpNode(latest));
    text.append(mvp);
  }
  box.replaceChildren(teamLogo(latest.champion, "sb-latest-logo"), text);
}

function renderTable() {
  const list = byNewest();
  sbRows.replaceChildren(...list.map((entry) => {
    const tr = document.createElement("tr");
    tr.dataset.season = String(entry.season);
    tr.className = "sb-row";
    tr.title = `Change the ${entry.season} champion`;
    const season = tr.insertCell();
    season.className = "sb-season";
    season.textContent = String(entry.season);
    const champ = tr.insertCell();
    champ.append(teamLink(entry.champion));
    const count = titleCount(entry.champion, entry.season);
    if (count > 1) {
      const badge = document.createElement("span");
      badge.className = "sb-count";
      badge.textContent = `×${count}`;
      badge.title = `League title No. ${count} for the ${teamName(entry.champion)}`;
      champ.append(badge);
    }
    tr.insertCell().textContent = scoreText(entry) || "—";
    const runner = tr.insertCell();
    if (entry.runnerUp) runner.append(teamLink(entry.runnerUp)); else runner.textContent = "—";
    const mvpCell = tr.insertCell();
    mvpCell.className = "sb-mvp";
    if (entry.mvp) mvpCell.append(mvpNode(entry)); else mvpCell.textContent = "—";
    tr.insertCell().textContent = entry.gm || "—";
    const actions = tr.insertCell();
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-delete";
    remove.dataset.action = "remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove the ${entry.season} champion`);
    remove.disabled = !canSave;
    actions.append(remove);
    return tr;
  }));
  const empty = document.querySelector("#sb-empty");
  empty.hidden = list.length > 0;
  empty.textContent = "No Super Bowls recorded yet.";
}

function renderTrophies() {
  const box = document.querySelector("#sb-trophies");
  const counts = new Map();
  for (const entry of officeData.championships) {
    const item = counts.get(entry.champion) || { titles: 0, seasons: [] };
    item.titles += 1;
    item.seasons.push(entry.season);
    counts.set(entry.champion, item);
  }
  if (!counts.size) { box.className = "sb-trophies is-empty"; box.textContent = "No titles yet."; return; }
  box.className = "sb-trophies";
  const sorted = [...counts.entries()].sort((a, b) => b[1].titles - a[1].titles || Math.max(...b[1].seasons) - Math.max(...a[1].seasons));
  box.replaceChildren(...sorted.map(([teamId, { titles, seasons: years }]) => {
    const card = document.createElement("a");
    card.className = "sb-trophy";
    card.href = `team.html?team=${encodeURIComponent(teamId)}`;
    const body = document.createElement("span");
    body.className = "sb-trophy-text";
    const name = document.createElement("strong");
    name.textContent = teamName(teamId);
    const when = document.createElement("span");
    when.textContent = years.sort((a, b) => a - b).join(", ");
    body.append(name, when);
    const total = document.createElement("b");
    total.className = "sb-trophy-count";
    total.textContent = String(titles);
    total.title = `${titles} league title${titles === 1 ? "" : "s"}`;
    card.append(teamLogo(teamId, "sb-trophy-logo"), body, total);
    return card;
  }));
}

function render() {
  renderLatest();
  renderTable();
  renderTrophies();
  showBoxScoreHint();
}

// ---- Form ----
const f = sbForm.elements;
document.querySelector("#sb-stat-inputs").replaceChildren(statInputsNode(playerStatGroups, "MVP "));
const teamOptions = (blank) => [new Option(blank, ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id))];
f.champion.append(...teamOptions("Choose a team"));
f.runnerUp.append(...teamOptions("Not set"));

function fillSuggestions() {
  const seen = new Set();
  const players = [];
  for (const { id } of nflTeams) for (const player of officeData.teams[id].roster) players.push(player.name);
  for (const player of officeData.contractPlayers || []) players.push(player.name);
  document.querySelector("#sb-players").replaceChildren(...players.filter((n) => !seen.has(n) && seen.add(n)).map((n) => new Option(n, n)));
  document.querySelector("#sb-gms").replaceChildren(...(officeData.members || []).map((m) => {
    const option = document.createElement("option");
    option.value = m.name;
    option.label = [m.role, m.teamId].filter(Boolean).join(" · ");
    return option;
  }));
}

// The GM listed for a team on the Members page.
function gmFor(teamId) {
  const members = (officeData.members || []).filter((m) => m.teamId === teamId);
  return (members.find((m) => !/co-?gm/i.test(m.role || "")) || members[0])?.name || "";
}

function resetForm() {
  sbForm.reset();
  f.season.value = String(thisSeason());
  document.querySelector("#sb-form-title").textContent = "Add A Champion";
  showBoxScoreHint();
  showMvpFill();
}

function openForm(entry) {
  f.season.value = String(entry.season);
  f.champion.value = entry.champion;
  f.runnerUp.value = entry.runnerUp || "";
  f.championScore.value = entry.championScore ?? "";
  f.runnerUpScore.value = entry.runnerUpScore ?? "";
  f.mvp.value = entry.mvp || "";
  f.mvpPosition.value = entry.mvpPosition || "";
  writeStatInputs(sbForm, playerStatKeys, entry.mvpLine);
  f.gm.value = entry.gm || "";
  document.querySelector("#sb-form-title").textContent = `Change the ${entry.season} champion`;
  showBoxScoreHint();
  showMvpFill();
  document.querySelector("#sb-editor").scrollIntoView({ behavior: "smooth", block: "center" });
  f.champion.focus({ preventScroll: true });
}

// When this season's Super Bowl box score is in Season Stats, offer to fill the form from it.
function superBowlGame() {
  return (officeData.games || []).find((game) => game.week === 22) || null;
}
function showBoxScoreHint() {
  const game = superBowlGame();
  const season = Number(f.season.value);
  if (!game || season !== thisSeason() || !canSave) { sbBoxScore.hidden = true; return; }
  const [a, b] = game.teams;
  if (a.score === b.score) { sbBoxScore.hidden = true; return; }
  const [winner, loser] = a.score > b.score ? [a, b] : [b, a];
  sbBoxScore.hidden = false;
  const text = document.createElement("span");
  text.textContent = `The ${season} Super Bowl box score is in Season Stats: ${teamName(winner.team)} ${winner.score}, ${teamName(loser.team)} ${loser.score}.`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button";
  button.textContent = "Fill from box score";
  button.addEventListener("click", () => {
    f.champion.value = winner.team;
    f.runnerUp.value = loser.team;
    f.championScore.value = String(winner.score);
    f.runnerUpScore.value = String(loser.score);
    if (!f.gm.value) f.gm.value = gmFor(winner.team);
    sbStatus.textContent = "Filled from the box score. Add the Super Bowl MVP, then use \"Fill stats from box score\" for their stats.";
    f.mvp.focus();
  });
  sbBoxScore.replaceChildren(text, button);
}
const mvpFill = document.querySelector("#sb-mvp-fill");
function showMvpFill() {
  const game = superBowlGame();
  mvpFill.hidden = !(game && canSave && Number(f.season.value) === thisSeason() && f.mvp.value.trim() && boxScoreStats(game, f.mvp.value));
}
mvpFill.addEventListener("click", () => {
  const found = boxScoreStats(superBowlGame(), f.mvp.value);
  if (!found) return;
  writeStatInputs(sbForm, playerStatKeys, found.values);
  if (!f.mvpPosition.value) {
    const player = findPlayerByName(officeData, f.mvp.value, found.team || undefined)?.player;
    f.mvpPosition.value = (player?.seasons?.[currentLeagueYear()]?.position || found.position || "").slice(0, 10);
  }
  sbStatus.textContent = `${f.mvp.value.trim()}'s Super Bowl stats filled from the box score.`;
});
f.mvp.addEventListener("input", showMvpFill);
f.mvp.addEventListener("change", () => {
  showMvpFill();
  if (f.mvpPosition.value) return;
  const player = findPlayerByName(officeData, f.mvp.value, f.champion.value || undefined)?.player;
  const position = player?.seasons?.[currentLeagueYear()]?.position;
  if (position && position.length <= 10) f.mvpPosition.value = position;
});
f.season.addEventListener("input", () => { showBoxScoreHint(); showMvpFill(); });
f.champion.addEventListener("change", () => { if (!f.gm.value && f.champion.value) f.gm.value = gmFor(f.champion.value); });

sbForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !sbForm.reportValidity()) return;
  const season = Number(f.season.value);
  if (f.runnerUp.value && f.runnerUp.value === f.champion.value) { sbStatus.textContent = "The runner-up can't be the same team as the champion."; f.runnerUp.focus(); return; }
  const scores = [f.championScore.value, f.runnerUpScore.value];
  if (scores.filter(Boolean).length === 1) { sbStatus.textContent = "Enter both scores, or leave both blank."; return; }
  if (scores.every(Boolean) && Number(scores[0]) < Number(scores[1])) { sbStatus.textContent = "The champion's score should be the higher one."; f.championScore.focus(); return; }
  const existing = officeData.championships.find((c) => c.season === season);
  if (!existing && officeData.championships.length >= 500) { sbStatus.textContent = "The champions list has reached its limit."; return; }
  const entry = existing || { id: newRecordId("title"), season };
  entry.champion = f.champion.value;
  if (f.runnerUp.value) entry.runnerUp = f.runnerUp.value; else delete entry.runnerUp;
  if (scores.every(Boolean)) { entry.championScore = Number(scores[0]); entry.runnerUpScore = Number(scores[1]); }
  else { delete entry.championScore; delete entry.runnerUpScore; }
  for (const field of Object.keys(championshipLimits)) {
    const value = f[field].value.trim();
    if (value) entry[field] = value.slice(0, championshipLimits[field]); else delete entry[field];
  }
  const line = readStatInputs(sbForm, playerStatKeys) || {};
  if (Object.keys(line).length) { entry.mvpLine = line; delete entry.mvpStats; } else delete entry.mvpLine;
  if (!entry.mvp) { delete entry.mvpLine; delete entry.mvpStats; delete entry.mvpPosition; }
  if (!existing) officeData.championships.push(entry);
  save(`The ${teamName(entry.champion)} are the ${season} Super Bowl champions.`);
  resetForm();
  render();
});

sbRows.addEventListener("click", async (event) => {
  const tr = event.target.closest("tr[data-season]");
  const entry = tr && officeData.championships.find((c) => c.season === Number(tr.dataset.season));
  if (!entry || !canSave) return;
  if (event.target.closest("a")) return;
  if (!event.target.closest('[data-action="remove"]')) { openForm(entry); return; }
  const ok = await confirmAction(`Remove the ${teamName(entry.champion)} as the ${entry.season} Super Bowl champion?`, { confirmLabel: "Remove champion", danger: true });
  if (!ok) return;
  officeData.championships = officeData.championships.filter((c) => c !== entry);
  save(`${entry.season} champion removed.`);
  render();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.championships)) officeData.championships = [];
    fillSuggestions();
    render();
  } catch {
    sbStatus.textContent = "An update from another tab could not be read.";
  }
});

if (!canSave) for (const element of sbForm.elements) element.disabled = true;
fillSuggestions();
resetForm();
render();
