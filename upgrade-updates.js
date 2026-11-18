// Admin → Stream Updates → Player Upgrades: upgrades teams have locked in (officeData.upgradeLocks, league-core.js).
const suList = document.querySelector("#su-list");
const suStatus = document.querySelector("#su-status");
const suNotice = document.querySelector("#su-storage-notice");
const suEmpty = document.querySelector("#su-empty");
const suState = document.querySelector("#su-filter-state");
const suTeam = document.querySelector("#su-filter-team");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  suNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.upgradeLocks)) officeData.upgradeLocks = [];

function save(message) {
  try {
    writeStoredOffice(officeData);
    suStatus.textContent = message;
    if (typeof refreshNavNotifications === "function") refreshNavNotifications();
  } catch (error) {
    suStatus.textContent = `Could not save: ${error.message}.`;
  }
}

function when(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

const gmOf = (teamId) => teamManagers(officeData, teamId).map((m) => m.name).join(" & ");
const ovrText = (p) => (p.from === null && p.to === null ? "no Madden overall" : `${p.from ?? "—"} → ${p.to ?? "—"}`);

function lockAsText(u) {
  const gm = gmOf(u.teamId);
  const lines = u.players.length ? u.players.map((p) => `${p.position ? `${p.position} ` : ""}${p.name}: ${ovrText(p)}`) : ["No upgrades this week"];
  return [`${teamName(u.teamId)} player upgrades, ${u.season} ${ratingWeekLabel(u.week)}${gm ? ` (${gm})` : ""} · ${when(u.createdAt)}`, ...lines].join("\n");
}

function renderLocks() {
  const keep = suTeam.value;
  suTeam.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  suTeam.value = keep;
  const state = suState.value;
  const shown = officeData.upgradeLocks
    .filter((u) => (state === "all" || (state === "done") === u.done) && (!suTeam.value || u.teamId === suTeam.value))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  suList.replaceChildren(...shown.map((u) => {
    const card = document.createElement("article");
    card.className = `su-card${u.done ? " is-done" : ""}`;
    card.dataset.lockId = u.id;
    const head = document.createElement("header");
    const team = document.createElement("a");
    team.className = "su-team";
    team.href = `team.html?team=${encodeURIComponent(u.teamId)}#ratings`;
    const code = document.createElement("b");
    code.textContent = u.teamId;
    team.append(code, teamName(u.teamId));
    const meta = document.createElement("span");
    meta.className = "su-meta";
    const gm = gmOf(u.teamId);
    meta.textContent = [`${u.season} ${ratingWeekLabel(u.week)}`, `locked ${when(u.createdAt)}`, gm ? `GM ${gm}` : "",
      `${u.players.length} ${u.players.length === 1 ? "upgrade" : "upgrades"}`, u.done && u.doneAt ? `done ${when(u.doneAt)}` : ""].filter(Boolean).join(" · ");
    head.append(team, meta);
    const body = document.createElement("div");
    body.className = "su-groups";
    const block = document.createElement("div");
    block.className = "su-group";
    const h = document.createElement("h4");
    h.textContent = "Players to upgrade";
    const list = document.createElement("ul");
    list.className = "su-up-list";
    if (!u.players.length) {
      const li = document.createElement("li");
      li.textContent = "The team locked in no upgrades this week.";
      list.append(li);
    }
    for (const p of u.players) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.className = "su-slot";
      label.textContent = p.position || "—";
      const name = document.createElement("a");
      name.className = "su-up-name";
      name.href = `player.html?id=${encodeURIComponent(p.id)}`;
      name.textContent = p.name;
      const from = document.createElement("span");
      from.className = "su-up-from";
      from.textContent = p.from ?? "—";
      const arrow = document.createElement("span");
      arrow.className = "su-arrow";
      arrow.textContent = "→";
      const to = document.createElement("strong");
      to.className = "su-to";
      to.textContent = p.to ?? "—";
      li.append(label, name, from, arrow, to);
      list.append(li);
    }
    block.append(h, list);
    body.append(block);
    const actions = document.createElement("div");
    actions.className = "su-actions";
    const open = document.createElement("a");
    open.className = "workspace-button";
    open.href = team.href;
    open.textContent = "Open player ratings ↗";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "workspace-button";
    copy.dataset.action = "copy";
    copy.textContent = "Copy";
    const unlock = document.createElement("button");
    unlock.type = "button";
    unlock.className = "workspace-button";
    unlock.dataset.action = "unlock";
    unlock.textContent = "Unlock week";
    unlock.title = "Removes this lock so the team can change its picks and lock in again.";
    unlock.disabled = !canSave;
    const done = document.createElement("button");
    done.type = "button";
    done.className = u.done ? "workspace-button" : "button button-lime";
    done.dataset.action = u.done ? "reopen" : "done";
    done.textContent = u.done ? "Move back to waiting" : "Mark done ✓";
    done.disabled = !canSave;
    actions.append(open, copy, unlock, done);
    card.append(head, body, actions);
    return card;
  }));
  const waiting = officeData.upgradeLocks.filter((u) => !u.done).length;
  document.querySelector("#su-count").textContent = String(waiting);
  document.querySelector("#su-done-all").disabled = !canSave || !waiting;
  document.querySelector("#su-copy-all").disabled = !waiting;
  suEmpty.hidden = shown.length > 0;
  suEmpty.textContent = state === "open"
    ? "All caught up. When a team locks in its upgrades on its Player Ratings tab, they show up here."
    : "No upgrades match these filters.";
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    suStatus.textContent = done;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.className = "su-copy-fallback";
    area.setAttribute("aria-label", "Upgrades to copy");
    suStatus.replaceChildren("Copying isn't allowed here. Select the text below and copy it yourself.", area);
    area.select();
  }
}

suState.addEventListener("change", renderLocks);
suTeam.addEventListener("change", renderLocks);

suList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const card = button?.closest("[data-lock-id]");
  const u = card && officeData.upgradeLocks.find(({ id }) => id === card.dataset.lockId);
  if (!u) return;
  const label = `${teamName(u.teamId)} ${ratingWeekLabel(u.week)}`;
  if (button.dataset.action === "copy") { copyText(lockAsText(u), `${label} upgrades copied.`); return; }
  if (!canSave) return;
  if (button.dataset.action === "unlock") {
    if (!await confirmAction(`Unlock ${label} upgrades? The team can change its picks and lock in again; this entry is removed.`, { confirmLabel: "Unlock" })) return;
    officeData.upgradeLocks = officeData.upgradeLocks.filter((x) => x !== u);
    save(`${label} unlocked.`);
  } else if (button.dataset.action === "done") { u.done = true; u.doneAt = new Date().toISOString(); save(`${label} upgrades marked done.`); }
  else { u.done = false; delete u.doneAt; save(`${label} upgrades moved back to waiting.`); }
  renderLocks();
});

document.querySelector("#su-done-all").addEventListener("click", async () => {
  const waiting = officeData.upgradeLocks.filter((u) => !u.done);
  if (!waiting.length || !canSave) return;
  if (!await confirmAction(`Mark all ${waiting.length} waiting ${waiting.length === 1 ? "lock-in" : "lock-ins"} done?`, { confirmLabel: "Mark all done" })) return;
  const now = new Date().toISOString();
  waiting.forEach((u) => { u.done = true; u.doneAt = now; });
  save(`${waiting.length} ${waiting.length === 1 ? "lock-in" : "lock-ins"} marked done.`);
  renderLocks();
});

document.querySelector("#su-copy-all").addEventListener("click", () => {
  const waiting = officeData.upgradeLocks.filter((u) => !u.done).sort((a, b) => teamName(a.teamId).localeCompare(teamName(b.teamId)) || a.week - b.week);
  if (!waiting.length) return;
  copyText(waiting.map(lockAsText).join("\n\n"), `${waiting.length} waiting ${waiting.length === 1 ? "lock-in" : "lock-ins"} copied.`);
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.upgradeLocks)) officeData.upgradeLocks = [];
    renderLocks();
  } catch {
    suStatus.textContent = "An update from another tab could not be read.";
  }
});

renderLocks();
