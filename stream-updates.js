// Admin → Stream Updates: depth chart changes queued by teams (officeData.streamUpdates, league-core.js).
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
if (!Array.isArray(officeData.streamUpdates)) officeData.streamUpdates = [];

const schemeLabels = { offense: "Offensive Scheme", defense: "Defensive Scheme", offPlaybook: "Offensive Playbook", defPlaybook: "Defensive Playbook" };
const sectionOf = Object.fromEntries(depthChartSections.flatMap(([section, rows]) => rows.map(([slot]) => [slot, section])));
const slotOrder = depthChartSections.flatMap(([, rows]) => rows.map(([slot]) => slot));

function save(message) {
  try {
    writeStoredOffice(officeData);
    suStatus.textContent = message;
  } catch (error) {
    suStatus.textContent = `Could not save: ${error.message}.`;
  }
}

function when(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

const changeLabel = (c) => (c.slot.startsWith("scheme:") ? schemeLabels[c.slot.slice(7)] || "Scheme" : `${c.slot} ${c.index + 1}`);
const sortedChanges = (changes) => [...changes].sort((a, b) => {
  const sa = a.slot.startsWith("scheme:") ? -1 : slotOrder.indexOf(a.slot);
  const sb = b.slot.startsWith("scheme:") ? -1 : slotOrder.indexOf(b.slot);
  return sa - sb || a.index - b.index;
});

function updateAsText(u) {
  const gm = teamManagers(officeData, u.teamId).map((m) => m.name).join(" & ");
  const lines = sortedChanges(u.changes).map((c) => `${changeLabel(c)}: ${c.from || "empty"} → ${c.to || "empty"}`);
  return [`${teamName(u.teamId)} depth chart${gm ? ` (${gm})` : ""} · ${when(u.updatedAt || u.createdAt)}`, ...lines].join("\n");
}

function renderUpdates() {
  const keep = suTeam.value;
  suTeam.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  suTeam.value = keep;
  const state = suState.value;
  const shown = officeData.streamUpdates
    .filter((u) => (state === "all" || (state === "done") === u.done) && (!suTeam.value || u.teamId === suTeam.value))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  suList.replaceChildren(...shown.map((u) => {
    const card = document.createElement("article");
    card.className = `su-card${u.done ? " is-done" : ""}`;
    card.dataset.updateId = u.id;
    const head = document.createElement("header");
    const team = document.createElement("a");
    team.className = "su-team";
    team.href = `team.html?team=${encodeURIComponent(u.teamId)}#depth-chart`;
    const code = document.createElement("b");
    code.textContent = u.teamId;
    team.append(code, teamName(u.teamId));
    const meta = document.createElement("span");
    meta.className = "su-meta";
    const gm = teamManagers(officeData, u.teamId).map((m) => m.name).join(" & ");
    meta.textContent = [when(u.updatedAt || u.createdAt), gm ? `GM ${gm}` : "", `${u.changes.length} ${u.changes.length === 1 ? "change" : "changes"}`, u.done && u.doneAt ? `done ${when(u.doneAt)}` : ""].filter(Boolean).join(" · ");
    head.append(team, meta);
    // Changes, grouped by section.
    const groups = new Map();
    for (const c of sortedChanges(u.changes)) {
      const section = c.slot.startsWith("scheme:") ? "Team Schemes" : sectionOf[c.slot] || "Other";
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push(c);
    }
    const body = document.createElement("div");
    body.className = "su-groups";
    for (const [section, changes] of groups) {
      const block = document.createElement("div");
      block.className = "su-group";
      const h = document.createElement("h4");
      h.textContent = section;
      const list = document.createElement("ul");
      for (const c of changes) {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.className = "su-slot";
        label.textContent = changeLabel(c);
        const from = document.createElement("span");
        from.className = `su-from${c.from ? "" : " is-empty"}`;
        from.textContent = c.from || "empty";
        const arrow = document.createElement("span");
        arrow.className = "su-arrow";
        arrow.textContent = "→";
        const to = document.createElement("strong");
        to.className = `su-to${c.to ? "" : " is-empty"}`;
        to.textContent = c.to || "empty";
        li.append(label, from, arrow, to);
        list.append(li);
      }
      block.append(h, list);
      body.append(block);
    }
    const actions = document.createElement("div");
    actions.className = "su-actions";
    const open = document.createElement("a");
    open.className = "workspace-button";
    open.href = `team.html?team=${encodeURIComponent(u.teamId)}#depth-chart`;
    open.textContent = "Open depth chart ↗";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "workspace-button";
    copy.dataset.action = "copy";
    copy.textContent = "Copy";
    const done = document.createElement("button");
    done.type = "button";
    done.className = u.done ? "workspace-button" : "button button-lime";
    done.dataset.action = u.done ? "reopen" : "done";
    done.textContent = u.done ? "Move back to waiting" : "Mark done ✓";
    done.disabled = !canSave;
    actions.append(open, copy, done);
    card.append(head, body, actions);
    return card;
  }));
  const waiting = officeData.streamUpdates.filter((u) => !u.done).length;
  document.querySelector("#su-count").textContent = String(waiting);
  document.querySelector("#su-done-all").disabled = !canSave || !waiting;
  document.querySelector("#su-copy-all").disabled = !waiting;
  suEmpty.hidden = shown.length > 0;
  suEmpty.textContent = state === "open"
    ? "All caught up. When a team changes its depth chart, the changes show up here."
    : "No updates match these filters.";
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    suStatus.textContent = done;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.className = "su-copy-fallback";
    area.setAttribute("aria-label", "Updates to copy");
    suStatus.replaceChildren("Copying isn't allowed here. Select the text below and copy it yourself.", area);
    area.select();
  }
}

suState.addEventListener("change", renderUpdates);
suTeam.addEventListener("change", renderUpdates);

suList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  const card = button?.closest("[data-update-id]");
  const u = card && officeData.streamUpdates.find(({ id }) => id === card.dataset.updateId);
  if (!u) return;
  if (button.dataset.action === "copy") { copyText(updateAsText(u), `${teamName(u.teamId)} update copied.`); return; }
  if (!canSave) return;
  if (button.dataset.action === "done") { u.done = true; u.doneAt = new Date().toISOString(); save(`${teamName(u.teamId)} update marked done.`); }
  else { u.done = false; delete u.doneAt; save(`${teamName(u.teamId)} update moved back to waiting.`); }
  renderUpdates();
});

document.querySelector("#su-done-all").addEventListener("click", async () => {
  const waiting = officeData.streamUpdates.filter((u) => !u.done);
  if (!waiting.length || !canSave) return;
  if (!await confirmAction(`Mark all ${waiting.length} waiting ${waiting.length === 1 ? "update" : "updates"} done?`, { confirmLabel: "Mark all done" })) return;
  const now = new Date().toISOString();
  waiting.forEach((u) => { u.done = true; u.doneAt = now; });
  save(`${waiting.length} ${waiting.length === 1 ? "update" : "updates"} marked done.`);
  renderUpdates();
});

document.querySelector("#su-copy-all").addEventListener("click", () => {
  const waiting = officeData.streamUpdates.filter((u) => !u.done).sort((a, b) => teamName(a.teamId).localeCompare(teamName(b.teamId)));
  if (!waiting.length) return;
  copyText(waiting.map(updateAsText).join("\n\n"), `${waiting.length} waiting ${waiting.length === 1 ? "update" : "updates"} copied.`);
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.streamUpdates)) officeData.streamUpdates = [];
    renderUpdates();
  } catch {
    suStatus.textContent = "An update from another tab could not be read.";
  }
});

renderUpdates();
