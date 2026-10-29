// League Members. Entries live in officeData.members (league-core.js).
const memRows = document.querySelector("#mem-rows");
const memStatus = document.querySelector("#mem-status");
const memNotice = document.querySelector("#mem-storage-notice");
const memEmpty = document.querySelector("#mem-empty");
const memSearch = document.querySelector("#mem-search");
const memFilterRole = document.querySelector("#mem-filter-role");
const memForm = document.querySelector("#mem-add-form");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  memNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.members)) officeData.members = [];

function save(message) {
  try {
    writeStoredOffice(officeData);
    memStatus.textContent = message;
  } catch (error) {
    memStatus.textContent = `Could not save: ${error.message}.`;
  }
}

const teamOptions = () => [new Option("No team", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id))];
const formatJoined = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function sortedMembers() {
  const roleRank = (role) => { const i = memberRoles.indexOf(role); return i === -1 ? memberRoles.length : i; };
  return [...officeData.members].sort((a, b) =>
    (a.teamId ? 1 : 0) - (b.teamId ? 1 : 0) ||
    (a.teamId && b.teamId ? teamName(a.teamId).localeCompare(teamName(b.teamId)) : 0) ||
    roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name));
}

function textCell(member, field, label, placeholder = "—") {
  const input = document.createElement("input");
  input.type = "text";
  input.value = member[field] || "";
  input.maxLength = memberTextLimits[field];
  input.dataset.field = field;
  input.placeholder = placeholder;
  if (field === "role") input.setAttribute("list", "mem-role-list");
  input.setAttribute("aria-label", `${label} for ${member.name}`);
  input.disabled = !canSave;
  return input;
}

function fillRoleFilter() {
  const keep = memFilterRole.value;
  const roles = [...new Set([...memberRoles, ...officeData.members.map((m) => m.role).filter(Boolean)])];
  memFilterRole.replaceChildren(new Option("All roles", ""), ...roles.map((role) => new Option(role, role)));
  memFilterRole.value = roles.includes(keep) ? keep : "";
}

function renderMembers() {
  fillRoleFilter();
  const query = memSearch.value.trim().toLowerCase();
  const shown = sortedMembers().filter((m) =>
    (!memFilterRole.value || m.role === memFilterRole.value) &&
    (!query || `${m.name} ${m.contact || ""} ${m.notes || ""} ${m.teamId ? `${m.teamId} ${teamName(m.teamId)}` : ""}`.toLowerCase().includes(query)));

  const fragment = document.createDocumentFragment();
  for (const member of shown) {
    const tr = document.createElement("tr");
    tr.dataset.memberId = member.id;
    const teamCell = tr.insertCell();
    teamCell.className = "mem-team";
    const select = document.createElement("select");
    select.dataset.field = "teamId";
    select.setAttribute("aria-label", `Team for ${member.name}`);
    select.append(...teamOptions());
    select.value = member.teamId || "";
    select.disabled = !canSave;
    teamCell.append(select);
    if (member.teamId) {
      const link = document.createElement("a");
      link.className = "mem-sheet-link";
      link.href = `team.html?team=${encodeURIComponent(member.teamId)}`;
      link.textContent = "Sheet ↗";
      link.title = `Open the ${teamName(member.teamId)} salary sheet`;
      teamCell.append(link);
    }
    const nameCell = tr.insertCell();
    nameCell.className = "mem-name";
    const name = textCell(member, "name", "Name", "");
    name.required = true;
    nameCell.append(name);
    tr.insertCell().append(textCell(member, "role", "Role", "General Manager"));
    tr.insertCell().append(textCell(member, "contact", "Contact"));
    const joinedCell = tr.insertCell();
    const joined = document.createElement("input");
    joined.type = "date";
    joined.value = member.joined || "";
    joined.dataset.field = "joined";
    joined.setAttribute("aria-label", `Joined date for ${member.name}`);
    joined.disabled = !canSave;
    joinedCell.append(joined);
    const notesCell = tr.insertCell();
    notesCell.className = "mem-notes";
    notesCell.append(textCell(member, "notes", "Notes"));
    const actions = tr.insertCell();
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-delete";
    remove.dataset.action = "remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${member.name} from the members list`);
    remove.disabled = !canSave;
    actions.append(remove);
    fragment.append(tr);
  }
  memRows.replaceChildren(fragment);
  document.querySelector("#mem-count").textContent = String(officeData.members.length);
  const filled = new Set(officeData.members.map((m) => m.teamId).filter(Boolean));
  document.querySelector("#mem-filled").textContent = `${filled.size} / ${nflTeams.length}`;
  memEmpty.hidden = shown.length > 0;
  memEmpty.textContent = officeData.members.length ? "No members match these filters." : "No members yet. Add the commissioner and each GM above.";

  // Open teams, by division.
  const open = document.querySelector("#mem-open");
  const openTeams = nflDivisions.flatMap((division) => division.teams.filter((id) => !filled.has(id)).map((id) => ({ id, division: division.name })));
  if (!openTeams.length) {
    open.textContent = "Every team has a GM.";
    open.className = "mem-open is-full";
  } else {
    open.className = "mem-open";
    open.replaceChildren(...openTeams.map(({ id, division }) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "mem-open-team";
      chip.dataset.team = id;
      chip.title = `Add a member to the ${teamName(id)}`;
      const code = document.createElement("strong");
      code.textContent = id;
      const label = document.createElement("span");
      label.textContent = `${teamName(id)} · ${division}`;
      chip.append(code, label);
      return chip;
    }));
  }
}

memSearch.addEventListener("input", renderMembers);
memFilterRole.addEventListener("change", renderMembers);

memRows.addEventListener("change", (event) => {
  const input = event.target.closest("[data-field]");
  const tr = input?.closest("tr");
  const member = tr && officeData.members.find(({ id }) => id === tr.dataset.memberId);
  if (!member || !canSave) return;
  const field = input.dataset.field;
  const value = input.value.trim();
  if (field === "name") {
    if (!value) { input.value = member.name; memStatus.textContent = "A member needs a name."; return; }
    member.name = value.slice(0, memberTextLimits.name);
  } else if (field === "teamId") {
    const taken = value && officeData.members.find((m) => m !== member && m.teamId === value && !/co-?gm/i.test(m.role || ""));
    member.teamId = value;
    save(`${member.name} ${value ? `now runs the ${teamName(value)}` : "has no team"}.${taken ? ` ${taken.name} is also listed for that team; set one of them as Co-GM or change their team.` : ""}`);
    renderMembers();
    return;
  } else if (field === "joined") {
    if (value) member.joined = value; else delete member.joined;
  } else {
    if (value) member[field] = value.slice(0, memberTextLimits[field]); else delete member[field];
  }
  save(`${member.name}: ${field} updated.`);
  if (field === "role") renderMembers();
});

memRows.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="remove"]');
  const tr = button?.closest("tr");
  const member = tr && officeData.members.find(({ id }) => id === tr.dataset.memberId);
  if (!member || !canSave) return;
  const ok = await confirmAction(`Remove ${member.name}${member.teamId ? ` (${member.teamId})` : ""} from the members list?`, { confirmLabel: "Remove member", danger: true });
  if (!ok) return;
  officeData.members = officeData.members.filter(({ id }) => id !== member.id);
  save(`${member.name} removed from the members list.${member.teamId ? ` The ${teamName(member.teamId)} are open.` : ""}`);
  renderMembers();
});

document.querySelector("#mem-open").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-team]");
  if (!chip) return;
  memForm.elements.team.value = chip.dataset.team;
  if (!memForm.elements.role.value) memForm.elements.role.value = "General Manager";
  memForm.scrollIntoView({ behavior: "smooth", block: "center" });
  memForm.elements.name.focus({ preventScroll: true });
});

// ---- Add ----
memForm.elements.team.append(...teamOptions());
document.querySelector("#mem-role-list").append(...memberRoles.map((role) => new Option(role, role)));

memForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !memForm.reportValidity()) return;
  if (officeData.members.length >= 500) { memStatus.textContent = "The members list has reached its 500-person limit."; return; }
  const f = memForm.elements;
  const member = { id: newRecordId("member"), name: f.name.value.trim().slice(0, memberTextLimits.name), teamId: f.team.value };
  const role = f.role.value.trim() || (member.teamId ? "General Manager" : "");
  if (role) member.role = role.slice(0, memberTextLimits.role);
  for (const field of ["contact", "notes"]) if (f[field].value.trim()) member[field] = f[field].value.trim().slice(0, memberTextLimits[field]);
  if (f.joined.value) member.joined = f.joined.value;
  const taken = member.teamId && officeData.members.find((m) => m.teamId === member.teamId && !/co-?gm/i.test(m.role || ""));
  officeData.members.push(member);
  memForm.reset();
  save(`${member.name} added${member.teamId ? ` as ${member.role} of the ${teamName(member.teamId)}` : ""}.${taken && !/co-?gm/i.test(member.role || "") ? ` ${taken.name} is also listed for that team.` : ""}`);
  renderMembers();
  f.name.focus();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.members)) officeData.members = [];
    renderMembers();
  } catch {
    memStatus.textContent = "An update from another tab could not be read.";
  }
});

if (!canSave) for (const element of memForm.elements) element.disabled = true;
renderMembers();
