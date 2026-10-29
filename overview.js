// Overview: League Leaders cards, read from the Stats page's tables.
const leaderCardsSpec = [
  { title: "Pass Yards", category: "passing", pattern: /^(PASS)?(YDS|YARDS)$/, empty: "passing" },
  { title: "Rush Yards", category: "rushing", pattern: /^(RUSH)?(YDS|YARDS)$/, empty: "rushing" },
  { title: "Receiving Yards", category: "receiving", pattern: /^(REC)?(YDS|YARDS)$/, empty: "receiving" },
  { title: "Sacks", category: "defense", pattern: /^(SACKS?|SCK|SK)$/, empty: "defense" },
  { title: "Interceptions", category: "defense", pattern: /^(INT|INTS|INTERCEPTIONS)$/, empty: "defense" }
];

function overviewLogo(teamId) {
  const team = nflTeams.find(({ id }) => id === teamId);
  const wrap = document.createElement("span");
  wrap.className = "leader-logo";
  if (!team) return wrap;
  const image = document.createElement("img");
  image.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team.logo}.png`;
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", () => { image.remove(); wrap.textContent = teamId; }, { once: true });
  wrap.append(image);
  return wrap;
}

// The #1 player's profile photo (Photo URL on their profile), else the team logo.
function leaderPhoto(found, teamId) {
  const url = found ? profilePhotoSrc(playerProfile(found.player)) : "";
  if (!url) return overviewLogo(teamId);
  const wrap = document.createElement("span");
  wrap.className = "leader-logo leader-photo";
  const image = document.createElement("img");
  image.src = url;
  image.alt = found.player.name;
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => wrap.replaceWith(overviewLogo(teamId)), { once: true });
  wrap.append(image);
  return wrap;
}

function renderLeaders() {
  let data = emptyOfficeData();
  try {
    data = readStoredOffice() || data;
  } catch {
    // unreadable saved data: show empty cards
  }
  const grid = document.querySelector("#leaders-grid");
  const fromGames = (data.games || []).length;
  document.querySelector("#leaders-subtitle").textContent = fromGames
    ? `Top 5 in each category · season totals from ${fromGames} ${fromGames === 1 ? "game" : "games"}.`
    : "Top 5 in each category, from the Stats page.";
  grid.replaceChildren(...leaderCardsSpec.map((spec) => {
    const leaders = statLeaders(data, spec.category, spec.pattern, 5);
    const card = document.createElement("article");
    card.className = "leader-card";
    const title = document.createElement("h3");
    title.textContent = spec.title;
    card.append(title);
    if (!leaders || !leaders.length) {
      const empty = document.createElement("p");
      empty.className = "leader-empty";
      const link = document.createElement("a");
      link.href = "stats.html";
      link.textContent = "Add stats";
      empty.append(leaders ? `No ${spec.title.toLowerCase()} column in the ${spec.empty} stats yet. ` : `No ${spec.empty} stats yet. `, link);
      card.append(empty);
      return card;
    }
    // The leader gets a feature block; 2–5 follow as a list.
    const [first, ...rest] = leaders;
    const top = document.createElement("div");
    top.className = "leader-top";
    const who = document.createElement("div");
    who.className = "leader-top-name";
    const name = document.createElement("strong");
    const firstFound = findPlayerByName(data, first.name, first.team);
    if (firstFound) {
      const link = document.createElement("a");
      link.href = profileUrl(firstFound.player.id);
      link.textContent = first.name;
      name.append(link);
    } else {
      name.textContent = first.name;
    }
    const team = document.createElement("span");
    team.textContent = first.team ? (nflTeams.some(({ id }) => id === first.team) ? teamName(first.team) : first.team) : "";
    who.append(name, team);
    const value = document.createElement("span");
    value.className = "leader-top-value";
    value.textContent = first.display;
    top.append(leaderPhoto(firstFound, first.team), who, value);
    card.append(top);
    const list = document.createElement("ol");
    list.start = 2;
    for (const entry of rest) {
      const item = document.createElement("li");
      const player = document.createElement("span");
      player.className = "leader-name";
      const found = findPlayerByName(data, entry.name, entry.team);
      if (found) {
        const link = document.createElement("a");
        link.href = profileUrl(found.player.id);
        link.textContent = entry.name;
        player.append(link);
      } else {
        player.textContent = entry.name;
      }
      if (entry.team) {
        const small = document.createElement("small");
        small.textContent = entry.team;
        player.append(small);
      }
      const amount = document.createElement("strong");
      amount.textContent = entry.display;
      item.append(player, amount);
      list.append(item);
    }
    card.append(list);
    return card;
  }));
}

// Top 6 teams per conference by record (same order as the Standings page).
function renderConferenceLeaders() {
  let data = emptyOfficeData();
  try {
    data = readStoredOffice() || data;
  } catch {
    // unreadable saved data: show teams with empty records
  }
  const season = data.standings?.season;
  const anyGames = nflTeams.some(({ id }) => { const r = teamRecord(data, id); return r.w + r.l + r.t > 0; });
  document.querySelector("#top-teams-subtitle").textContent = anyGames
    ? `Top 6 teams in each conference${season ? ` · ${season} season` : ""}.`
    : "No records entered yet. Add them on the Standings page.";
  const grid = document.querySelector("#conference-grid");
  grid.replaceChildren(...["AFC", "NFC"].map((conference) => {
    const teamIds = nflDivisions.filter((division) => division.conference === conference).flatMap((division) => division.teams);
    const ranked = teamIds.map((teamId) => ({ teamId, record: teamRecord(data, teamId) })).sort(compareRecords).slice(0, 6);
    const card = document.createElement("article");
    card.className = "conference-card";
    const title = document.createElement("h3");
    title.textContent = conference;
    const wrap = document.createElement("div");
    wrap.className = "conference-table-wrap";
    const table = document.createElement("table");
    table.className = "conference-table";
    const head = table.createTHead().insertRow();
    for (const label of ["#", "Team", "W", "L", "T", "PCT", "DIFF", "STRK"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      head.append(th);
    }
    const body = table.createTBody();
    ranked.forEach(({ teamId, record }, index) => {
      const row = body.insertRow();
      row.insertCell().textContent = String(index + 1);
      const teamCell = row.insertCell();
      const team = document.createElement("span");
      team.className = "conference-team";
      const link = document.createElement("a");
      link.href = `team.html?team=${encodeURIComponent(teamId)}`;
      link.textContent = teamName(teamId);
      const division = document.createElement("small");
      division.textContent = teamDivision(teamId).name.replace(/^(AFC|NFC) /, "");
      team.append(overviewLogo(teamId), link, division);
      teamCell.append(team);
      const games = record.w + record.l + record.t;
      const diff = record.pf - record.pa;
      for (const text of [record.w, record.l, record.t, (games ? winPct(record) : 0).toFixed(3).replace(/^0/, ""), diff > 0 ? `+${diff}` : String(diff), record.streak || "—"]) {
        row.insertCell().textContent = String(text);
      }
      const diffCell = row.cells[6];
      diffCell.className = diff > 0 ? "is-up" : diff < 0 ? "is-down" : "";
    });
    wrap.append(table);
    card.append(title, wrap);
    return card;
  }));
}

// Last 5 entries from the Transaction Log, newest first (same order as the log).
function renderRecentTransactions() {
  let data = emptyOfficeData();
  try {
    data = readStoredOffice() || data;
  } catch {
    // unreadable saved data: show the empty state
  }
  const list = document.querySelector("#recent-list");
  const entries = [...(data.transactions || [])].sort((a, b) =>
    b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 5);
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "recent-empty";
    empty.textContent = "No transactions yet. Approved trades, releases and anything added on the Transaction Log show up here.";
    list.replaceChildren(empty);
    return;
  }
  const plain = (text) => String(text || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  list.replaceChildren(...entries.map((entry) => {
    const item = document.createElement("li");
    item.className = `recent-item txn-${entry.type}`;
    const meta = document.createElement("div");
    meta.className = "recent-meta";
    const [year, month, day] = entry.date.split("-").map(Number);
    const date = document.createElement("time");
    date.dateTime = entry.date;
    date.textContent = new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const badge = document.createElement("span");
    badge.className = "txn-badge";
    badge.textContent = transactionTypes[entry.type] || "Other";
    meta.append(date, badge);
    const teams = document.createElement("div");
    teams.className = "recent-teams";
    for (const id of entry.teams) {
      if (id === freeAgentTeamId) {
        const fa = document.createElement("span");
        fa.className = "txn-team";
        fa.textContent = "FA";
        teams.append(fa);
        continue;
      }
      const link = document.createElement("a");
      link.href = `team.html?team=${encodeURIComponent(id)}`;
      link.title = teamName(id);
      link.append(overviewLogo(id));
      teams.append(link);
    }
    const body = document.createElement("div");
    body.className = "recent-body";
    const headline = document.createElement("strong");
    const detail = document.createElement("p");
    if (entry.type === "trade") {
      headline.textContent = entry.tradeNumber ? `Trade ${entry.tradeNumber}` : "Trade";
      if (entry.sides) {
        detail.textContent = entry.sides.map((side) => `${side.teamId} sends ${side.items.length ? side.items.join(", ") : "nothing"}`).join(" · ");
      } else {
        detail.textContent = plain(entry.details.replace(/^\s*\**\s*trade\s*#?\s*\d+\s*:?\s*\**/i, ""));
      }
    } else {
      headline.textContent = entry.player || transactionTypes[entry.type] || "Transaction";
      detail.textContent = plain(entry.details);
    }
    body.append(headline);
    if (detail.textContent) body.append(detail);
    item.append(meta, teams, body);
    return item;
  }));
}

// ---- Key dates ----
const keyDatesList = document.querySelector("#key-dates-list");
const keyDatesEditor = document.querySelector("#key-dates-editor");
const keyDatesToggle = document.querySelector("#key-dates-edit");
const keyDatesStatus = document.querySelector("#key-dates-status");
const keyDatesForm = document.querySelector("#key-dates-form");

function readOverviewData() {
  try {
    return { data: readStoredOffice() || emptyOfficeData(), canSave: true };
  } catch {
    return { data: emptyOfficeData(), canSave: false };
  }
}

function currentKeyDates(data) {
  return Array.isArray(data.keyDates) ? data.keyDates : defaultKeyDates();
}

function parseDay(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysUntil(date) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseDay(date) - start) / 86400000);
}

function countdownText(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "Yesterday";
  return `${-days} days ago`;
}

function renderKeyDates() {
  const { data } = readOverviewData();
  const all = [...currentKeyDates(data)].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  const upcoming = all.filter((entry) => daysUntil(entry.date) >= 0);
  // Upcoming dates first; if fewer than 4, fill with the most recent past ones.
  const past = all.filter((entry) => daysUntil(entry.date) < 0).reverse().slice(0, Math.max(0, 4 - upcoming.length)).reverse();
  const shown = [...past, ...upcoming.slice(0, 8)];
  if (!shown.length) {
    const empty = document.createElement("li");
    empty.className = "recent-empty";
    empty.textContent = "No key dates yet. Use Edit dates to add deadlines, draft day, the start of free agency and more.";
    keyDatesList.replaceChildren(empty);
  } else {
    const nextId = upcoming[0]?.id;
    keyDatesList.replaceChildren(...shown.map((entry) => {
      const days = daysUntil(entry.date);
      const item = document.createElement("li");
      item.className = `key-date${days < 0 ? " is-past" : ""}${entry.id === nextId ? " is-next" : ""}`;
      const day = parseDay(entry.date);
      const stamp = document.createElement("time");
      stamp.className = "key-date-stamp";
      stamp.dateTime = entry.date;
      const month = document.createElement("span");
      month.textContent = day.toLocaleDateString("en-US", { month: "short" });
      const dayNumber = document.createElement("strong");
      dayNumber.textContent = String(day.getDate());
      const year = document.createElement("span");
      year.textContent = String(day.getFullYear());
      stamp.append(month, dayNumber, year);
      const body = document.createElement("div");
      body.className = "key-date-body";
      const label = document.createElement("strong");
      label.textContent = entry.label;
      const when = document.createElement("span");
      when.className = "key-date-countdown";
      when.textContent = `${day.toLocaleDateString("en-US", { weekday: "short" })} · ${countdownText(days)}`;
      body.append(label, when);
      if (entry.note) {
        const note = document.createElement("p");
        note.textContent = entry.note;
        body.append(note);
      }
      item.append(stamp, body);
      return item;
    }));
  }
  renderKeyDatesManager(all);
}

function renderKeyDatesManager(all) {
  const list = document.querySelector("#key-dates-manage");
  list.replaceChildren(...all.map((entry) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = `${parseDay(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — ${entry.label}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-delete";
    remove.dataset.keyDate = entry.id;
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${entry.label}`);
    item.append(text, remove);
    return item;
  }));
}

function saveKeyDates(change, message) {
  const { data, canSave } = readOverviewData();
  if (!canSave) {
    keyDatesStatus.textContent = "Saved league data couldn't be read, so dates can't be changed here.";
    return;
  }
  data.keyDates = change([...currentKeyDates(data)]);
  try {
    writeStoredOffice(data);
    keyDatesStatus.textContent = message;
  } catch (error) {
    keyDatesStatus.textContent = `Could not save: ${error.message}.`;
  }
  renderKeyDates();
}

keyDatesToggle.addEventListener("click", () => {
  const open = keyDatesEditor.hidden;
  keyDatesEditor.hidden = !open;
  keyDatesToggle.setAttribute("aria-pressed", String(open));
  keyDatesToggle.textContent = open ? "Done" : "Edit dates";
  if (open) document.querySelector("#key-date-date").focus();
});

keyDatesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!keyDatesForm.reportValidity()) return;
  const date = keyDatesForm.elements.date.value;
  const label = keyDatesForm.elements.label.value.trim();
  const note = keyDatesForm.elements.note.value.trim();
  if (!label) return;
  saveKeyDates((list) => {
    if (list.length >= 200) return list;
    const entry = { id: newRecordId("date"), date, label: label.slice(0, 80) };
    if (note) entry.note = note.slice(0, 140);
    return [...list, entry];
  }, `${label} added.`);
  keyDatesForm.reset();
  keyDatesForm.elements.date.focus();
});

document.querySelector("#key-dates-manage").addEventListener("click", (event) => {
  const button = event.target.closest("[data-key-date]");
  if (!button) return;
  saveKeyDates((list) => list.filter(({ id }) => id !== button.dataset.keyDate), "Date removed.");
});

// ---- Recent news: the 3 newest Media posts ----
function renderRecentNews() {
  const { data } = readOverviewData();
  const list = document.querySelector("#news-list");
  const posts = [...(data.media || [])]
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 3);
  if (!posts.length) {
    const empty = document.createElement("p");
    empty.className = "recent-empty";
    empty.append("No news yet. ");
    const link = document.createElement("a");
    link.href = "media.html";
    link.textContent = "Post the first story on the Media page";
    empty.append(link, ".");
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...posts.map((post) => {
    const card = document.createElement("a");
    card.className = `news-item media-${post.type}${post.image ? "" : " no-image"}`;
    card.href = `media.html#${encodeURIComponent(post.id)}`;
    if (post.image) {
      const figure = document.createElement("div");
      figure.className = "news-image";
      const img = document.createElement("img");
      img.src = post.image;
      img.alt = "";
      figure.append(img);
      card.append(figure);
    }
    const body = document.createElement("div");
    body.className = "news-body";
    const meta = document.createElement("p");
    meta.className = "media-card-meta";
    const tag = document.createElement("span");
    tag.className = "media-type-tag";
    tag.textContent = mediaTypes[post.type] || "News";
    const [year, month, day] = post.date.split("-").map(Number);
    meta.append(tag, `${new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${post.author ? ` · ${post.author}` : ""}`);
    const title = document.createElement("strong");
    title.textContent = post.title;
    body.append(meta, title);
    if (post.body) {
      const snippet = document.createElement("p");
      snippet.className = "news-snippet";
      snippet.textContent = post.body.replace(/\s+/g, " ").trim();
      body.append(snippet);
    }
    if (post.teams.length) {
      const teams = document.createElement("span");
      teams.className = "news-teams";
      teams.textContent = post.teams.join(" · ");
      body.append(teams);
    }
    card.append(body);
    return card;
  }));
}

window.addEventListener("storage", (event) => {
  if (event.key === officeStorageKey) { renderKeyDates(); renderLeaders(); renderConferenceLeaders(); renderRecentNews(); renderRecentTransactions(); }
});
renderRecentNews();
renderKeyDates();
renderLeaders();
renderConferenceLeaders();
renderRecentTransactions();
