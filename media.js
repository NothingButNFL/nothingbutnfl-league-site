// League Media feed. Posts live in officeData.media (league-core.js).
const mediaFeed = document.querySelector("#media-feed");
const mediaStatus = document.querySelector("#media-status");
const mediaNotice = document.querySelector("#media-storage-notice");
const mediaEmpty = document.querySelector("#media-empty");
const mediaForm = document.querySelector("#media-form");
const mediaCompose = document.querySelector("#media-compose");
const mediaSearch = document.querySelector("#media-search");
const mediaFilterType = document.querySelector("#media-filter-type");
const mediaFilterTeam = document.querySelector("#media-filter-team");
const imagePreview = document.querySelector("#media-image-preview");
const imageClear = document.querySelector("#media-image-clear");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  mediaNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
if (!Array.isArray(officeData.media)) officeData.media = [];

let pendingImage = "";
let editingId = null;

function save(message) {
  try {
    writeStoredOffice(officeData);
    mediaStatus.textContent = message;
    return true;
  } catch (error) {
    mediaStatus.textContent = /quota/i.test(error.name + error.message)
      ? "Browser storage is full, so this post wasn't saved. Remove an older post's image or use a smaller one."
      : `Could not save: ${error.message}.`;
    return false;
  }
}

const formatDate = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// ---------- form setup ----------
for (const [id, label] of Object.entries(mediaTypes)) mediaForm.elements.type.add(new Option(label, id));
const teamPicks = document.querySelector("#media-team-picks");
teamPicks.append(...nflTeams.map(({ id, name }) => {
  const label = document.createElement("label");
  label.className = "media-team-pick";
  label.title = name;
  const box = document.createElement("input");
  box.type = "checkbox";
  box.value = id;
  box.name = "teams";
  label.append(box, id);
  return label;
}));

function fillAuthors() {
  const names = [...new Set([...(officeData.members || []).map((m) => m.name), ...officeData.media.map((p) => p.author).filter(Boolean)])];
  document.querySelector("#media-author-list").replaceChildren(...names.map((name) => new Option(name, name)));
}

function resetForm() {
  mediaForm.reset();
  mediaForm.elements.date.value = localDateString();
  mediaForm.elements.type.value = "article";
  setImage("");
  editingId = null;
  document.querySelector("#media-submit").firstChild.textContent = "Publish post ";
  document.querySelector("#media-cancel").hidden = true;
}

function setImage(data) {
  pendingImage = data;
  imagePreview.hidden = !data;
  if (data) imagePreview.src = data; else imagePreview.removeAttribute("src");
  imageClear.hidden = !data;
  document.querySelector("#media-image-label").textContent = data ? "Replace image" : "Add an image";
}

// Shrinks the picture to 1000px on its long side, saved as JPEG.
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#071a33";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let quality = 0.82;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 560000 && quality > 0.4) { quality -= 0.1; data = canvas.toDataURL("image/jpeg", quality); }
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}

document.querySelector("#media-image").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) { mediaStatus.textContent = "That file isn't an image. Choose a JPG, PNG or WebP."; return; }
  try {
    setImage(await shrinkImage(file));
  } catch {
    mediaStatus.textContent = "That image couldn't be read. Try a JPG or PNG.";
  }
});
imageClear.addEventListener("click", () => setImage(""));
document.querySelector("#media-cancel").addEventListener("click", () => { resetForm(); mediaStatus.textContent = "Editing canceled."; });

mediaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !mediaForm.reportValidity()) return;
  const f = mediaForm.elements;
  const url = f.url.value.trim();
  if (url && !/^https?:\/\//i.test(url)) { mediaStatus.textContent = "Links need to start with https://"; return; }
  const existing = editingId && officeData.media.find(({ id }) => id === editingId);
  if (!existing && officeData.media.length >= 1000) { mediaStatus.textContent = "The media feed has reached its 1,000-post limit."; return; }
  const post = existing || { id: newRecordId("media"), createdAt: new Date().toISOString() };
  const before = existing ? JSON.parse(JSON.stringify(existing)) : null;
  post.title = f.title.value.trim().slice(0, mediaTextLimits.title);
  post.type = f.type.value;
  post.date = f.date.value;
  post.teams = [...mediaForm.querySelectorAll('input[name="teams"]:checked')].map((box) => box.value);
  for (const [field, value] of [["author", f.author.value.trim()], ["url", url], ["body", f.body.value.trim()]]) {
    if (value) post[field] = value.slice(0, mediaTextLimits[field]); else delete post[field];
  }
  if (pendingImage) post.image = pendingImage; else delete post.image;
  if (!existing) officeData.media.push(post);
  if (!save(existing ? `“${post.title}” updated.` : `“${post.title}” published.`)) {
    if (existing) Object.assign(existing, before); else officeData.media.pop();
    return;
  }
  resetForm();
  mediaCompose.open = false;
  renderFeed();
});

// ---------- feed ----------
function fillFilters() {
  const keep = [mediaFilterType.value, mediaFilterTeam.value];
  mediaFilterType.replaceChildren(new Option("All types", ""), ...Object.entries(mediaTypes).map(([id, label]) => new Option(label, id)));
  mediaFilterTeam.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  [mediaFilterType.value, mediaFilterTeam.value] = keep;
}

function paragraphs(text) {
  return String(text).split(/\n\s*\n/).map((chunk) => {
    const p = document.createElement("p");
    p.textContent = chunk.trim();
    return p;
  }).filter((p) => p.textContent);
}

function linkLabel(url, type) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { host = ""; }
  const verb = { video: "Watch", podcast: "Listen", presser: "Watch" }[type] || "Open";
  return `${verb}${host ? ` on ${host}` : ""} ↗`;
}

function renderFeed() {
  fillFilters();
  fillAuthors();
  const query = mediaSearch.value.trim().toLowerCase();
  const posts = [...officeData.media]
    .filter((post) => (!mediaFilterType.value || post.type === mediaFilterType.value) &&
      (!mediaFilterTeam.value || post.teams.includes(mediaFilterTeam.value)) &&
      (!query || `${post.title} ${post.author || ""} ${post.body || ""}`.toLowerCase().includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  mediaFeed.replaceChildren(...posts.map((post, index) => {
    const card = document.createElement("article");
    card.className = `media-card media-${post.type}${index === 0 && !query && !mediaFilterType.value && !mediaFilterTeam.value ? " is-lead" : ""}`;
    card.dataset.postId = post.id;
    card.id = post.id;
    card.tabIndex = -1;
    if (post.image) {
      const figure = document.createElement("div");
      figure.className = "media-card-image";
      const img = document.createElement("img");
      img.src = post.image;
      img.alt = "";
      img.loading = "lazy";
      figure.append(img);
      card.append(figure);
    }
    const body = document.createElement("div");
    body.className = "media-card-body";
    const meta = document.createElement("p");
    meta.className = "media-card-meta";
    const type = document.createElement("span");
    type.className = "media-type-tag";
    type.textContent = mediaTypes[post.type];
    meta.append(type, `${formatDate(post.date)}${post.author ? ` · ${post.author}` : ""}`);
    const title = document.createElement("h3");
    title.textContent = post.title;
    body.append(meta, title);
    if (post.body) {
      const text = document.createElement("div");
      text.className = "media-card-text";
      text.append(...paragraphs(post.body));
      body.append(text);
    }
    const foot = document.createElement("div");
    foot.className = "media-card-foot";
    if (post.teams.length) {
      const tags = document.createElement("div");
      tags.className = "media-card-teams";
      for (const id of post.teams) {
        const tag = document.createElement("a");
        tag.className = "txn-team";
        tag.href = `team.html?team=${encodeURIComponent(id)}`;
        tag.title = teamName(id);
        tag.textContent = id;
        tags.append(tag);
      }
      foot.append(tags);
    }
    const actions = document.createElement("div");
    actions.className = "media-card-actions";
    if (post.url) {
      const link = document.createElement("a");
      link.className = "media-card-link";
      link.href = post.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = linkLabel(post.url, post.type);
      actions.append(link);
    }
    if (canSave) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "workspace-button media-edit";
      edit.dataset.action = "edit";
      edit.textContent = "Edit";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "row-delete";
      remove.dataset.action = "delete";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Delete “${post.title}”`);
      actions.append(edit, remove);
    }
    foot.append(actions);
    body.append(foot);
    card.append(body);
    return card;
  }));
  document.querySelector("#media-count").textContent = String(posts.length);
  mediaEmpty.hidden = posts.length > 0;
  mediaEmpty.textContent = officeData.media.length
    ? "No posts match these filters."
    : "No posts yet. Use Create a media post to share the first article, video or power rankings.";
}

for (const control of [mediaFilterType, mediaFilterTeam]) control.addEventListener("change", renderFeed);
mediaSearch.addEventListener("input", renderFeed);

mediaFeed.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const card = button?.closest("[data-post-id]");
  const post = card && officeData.media.find(({ id }) => id === card.dataset.postId);
  if (!post || !canSave) return;
  if (button.dataset.action === "edit") {
    const f = mediaForm.elements;
    f.title.value = post.title;
    f.type.value = post.type;
    f.date.value = post.date;
    f.author.value = post.author || "";
    f.url.value = post.url || "";
    f.body.value = post.body || "";
    for (const box of mediaForm.querySelectorAll('input[name="teams"]')) box.checked = post.teams.includes(box.value);
    setImage(post.image || "");
    editingId = post.id;
    document.querySelector("#media-submit").firstChild.textContent = "Save changes ";
    document.querySelector("#media-cancel").hidden = false;
    mediaCompose.open = true;
    mediaCompose.scrollIntoView({ behavior: "smooth", block: "start" });
    f.title.focus({ preventScroll: true });
    return;
  }
  const ok = await confirmAction(`Delete “${post.title}”? This can't be undone.`, { confirmLabel: "Delete post", danger: true });
  if (!ok) return;
  officeData.media = officeData.media.filter(({ id }) => id !== post.id);
  if (editingId === post.id) resetForm();
  save(`“${post.title}” deleted.`);
  renderFeed();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.media)) officeData.media = [];
    renderFeed();
  } catch {
    mediaStatus.textContent = "An update from another tab could not be read.";
  }
});

if (!canSave) { mediaCompose.hidden = true; }
resetForm();
renderFeed();

// Arriving from the Overview's Recent News: scroll to that post and mark it.
function showLinkedPost() {
  const id = decodeURIComponent(location.hash.slice(1));
  const card = id && document.getElementById(id);
  if (!card || !card.classList.contains("media-card")) return;
  document.querySelectorAll(".media-card.is-linked").forEach((el) => el.classList.remove("is-linked"));
  card.classList.add("is-linked");
  card.scrollIntoView({ block: "center" });
  card.focus({ preventScroll: true });
}
showLinkedPost();
window.addEventListener("hashchange", showLinkedPost);
