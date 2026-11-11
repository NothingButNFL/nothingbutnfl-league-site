// News › Manage Reporters: the Insider Wire's reporters. Built-in insiders are listed read-only; the league's own
// reporters (data.insiderReporters) can be added, edited and removed. Uses insider.js helpers (insiderAllReporters,
// insiderAvatarEl, insiderInitials, insiderResizePhoto) and league-core.js storage.
(function manageReporters() {
  const list = document.querySelector("#rep-list");
  const form = document.querySelector("#rep-form");
  if (!list || !form) return;
  const status = document.querySelector("#rep-status");
  const preview = document.querySelector("#rep-preview");
  let editingId = null;
  let pendingPhoto = null; // data: URL from an upload, or null
  const read = () => { try { return readStoredOffice() || emptyOfficeData(); } catch { return null; } };

  function save(mutate, message) {
    const data = read();
    if (!data) { status.textContent = "Saved league data couldn't be read, so nothing was saved."; return false; }
    mutate(data);
    try { writeStoredOffice(data); } catch (error) { status.textContent = `Couldn't save: ${error.message}.`; return false; }
    status.textContent = message;
    render();
    return true;
  }

  function render() {
    const data = read() || emptyOfficeData();
    const counts = new Map();
    for (const p of data.insiderPosts || []) counts.set(p.reporterId, (counts.get(p.reporterId) || 0) + 1);
    list.replaceChildren(...insiderAllReporters(data).map((r) => {
      const li = document.createElement("li");
      li.className = `rep-item${r.custom ? "" : " is-builtin"}`;
      const text = document.createElement("div");
      text.className = "rep-text";
      const name = document.createElement("strong");
      name.textContent = r.name;
      const handle = document.createElement("span");
      const posts = counts.get(r.id) || 0;
      handle.textContent = `${r.handle} · ${r.custom ? `${posts} post${posts === 1 ? "" : "s"}` : "Built-in · writes the automatic reports"}`;
      text.append(name, handle);
      li.append(insiderAvatarEl(r), text);
      if (r.custom) {
        const actions = document.createElement("span");
        actions.className = "rep-actions";
        for (const [action, label] of [["edit", "Edit"], ["remove", "Remove"]]) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "workspace-button";
          b.dataset.action = action;
          b.dataset.id = r.id;
          b.textContent = label;
          actions.append(b);
        }
        li.append(actions);
      }
      return li;
    }));
    showPreview();
  }

  function showPreview() {
    const name = form.elements.name.value.trim() || "New Reporter";
    const current = editingId ? (read()?.insiderReporters || []).find((r) => r.id === editingId) : null;
    const url = form.elements.photoUrl.value.trim();
    const photo = form.elements.clearPhoto.checked ? "" : pendingPhoto || (url.startsWith("https://") ? url : current?.photo || "");
    const handle = form.elements.handle.value.trim().replace(/^@+/, "");
    const card = document.createElement("div");
    card.className = "rep-preview-card";
    const who = document.createElement("div");
    who.className = "rep-text";
    const n = document.createElement("strong");
    n.textContent = name;
    const h = document.createElement("span");
    h.textContent = handle ? `@${handle}` : "@handle";
    who.append(n, h);
    card.append(insiderAvatarEl({ name, initials: insiderInitials(name), color: form.elements.color.value, photo }), who);
    preview.replaceChildren(card);
  }

  function resetForm() {
    editingId = null;
    pendingPhoto = null;
    form.reset();
    document.querySelector("#rep-form-kicker").textContent = "NEW";
    document.querySelector("#rep-form-title").textContent = "Add a reporter";
    document.querySelector("#rep-submit").textContent = "Add reporter";
    document.querySelector("#rep-cancel").hidden = true;
    form.querySelector(".rep-clear-photo").hidden = true;
    showPreview();
  }

  for (const name of ["name", "handle", "color", "photoUrl", "clearPhoto"]) form.elements[name].addEventListener("input", showPreview);
  form.elements.clearPhoto.addEventListener("change", showPreview);
  form.elements.photo.addEventListener("change", async () => {
    const file = form.elements.photo.files[0];
    if (!file) { pendingPhoto = null; showPreview(); return; }
    try { pendingPhoto = await insiderResizePhoto(file); status.textContent = ""; }
    catch (error) { pendingPhoto = null; status.textContent = `Profile picture not used: ${error.message}.`; }
    showPreview();
  });
  document.querySelector("#rep-cancel").addEventListener("click", resetForm);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const handle = form.elements.handle.value.trim().replace(/^@+/, "").replace(/\s+/g, "");
    if (!name || !handle) { status.textContent = "Give the reporter a name and a handle."; return; }
    const url = form.elements.photoUrl.value.trim();
    const fields = { name, handle: `@${handle}`.slice(0, 30), color: form.elements.color.value };
    const photo = pendingPhoto || (url.startsWith("https://") ? url : null);
    if (editingId) {
      const id = editingId;
      const ok = save((data) => {
        data.insiderReporters = (data.insiderReporters || []).map((r) => {
          if (r.id !== id) return r;
          const next = { ...r, ...fields };
          if (form.elements.clearPhoto.checked) delete next.photo;
          else if (photo) next.photo = photo;
          return next;
        });
      }, `${name} updated.`);
      if (ok) resetForm();
    } else {
      const reporter = { id: newRecordId("reporter"), ...fields };
      if (photo) reporter.photo = photo;
      const ok = save((data) => { data.insiderReporters = [...(data.insiderReporters || []), reporter].slice(-50); }, `${name} added. Post as them from "Write a post" on the Overview's Insider Wire.`);
      if (ok) resetForm();
    }
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const reporter = (read()?.insiderReporters || []).find((r) => r.id === button.dataset.id);
    if (!reporter) return;
    if (button.dataset.action === "edit") {
      editingId = reporter.id;
      pendingPhoto = null;
      form.reset();
      form.elements.name.value = reporter.name;
      form.elements.handle.value = reporter.handle.replace(/^@/, "");
      form.elements.color.value = reporter.color;
      if (reporter.photo?.startsWith("https://")) form.elements.photoUrl.value = reporter.photo;
      form.querySelector(".rep-clear-photo").hidden = !reporter.photo;
      document.querySelector("#rep-form-kicker").textContent = "EDIT";
      document.querySelector("#rep-form-title").textContent = `Edit ${reporter.name}`;
      document.querySelector("#rep-submit").textContent = "Save changes";
      document.querySelector("#rep-cancel").hidden = false;
      showPreview();
      form.scrollIntoView({ behavior: "smooth", block: "nearest" });
      form.elements.name.focus({ preventScroll: true });
    } else if (await confirmAction(`Remove ${reporter.name}? Their posts stay on the Insider Wire, shown as a league reporter.`, { confirmLabel: "Remove reporter", danger: true })) {
      save((data) => { data.insiderReporters = (data.insiderReporters || []).filter((r) => r.id !== reporter.id); }, `${reporter.name} removed.`);
      if (editingId === reporter.id) resetForm();
    }
  });

  window.addEventListener("storage", (event) => { if (event.key === officeStorageKey) render(); });
  render();
})();
