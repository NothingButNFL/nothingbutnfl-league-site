// Home › Latest Stream: the league's YouTube channel, just below the scoreboard. It embeds the channel's live-streams
// playlist (UULV + the channel ID without its "UC"), which YouTube keeps newest first, so the player shows the stream
// that's on now when the channel is live and the most recent stream otherwise. No API key is needed. The channel is set
// with "Set channel" and saved with the league data (data.youtubeChannel). Uses league-core.js.
(function streamCard() {
  const section = document.querySelector("#latest-stream");
  if (!section) return;
  const frame = section.querySelector("#stream-frame");
  const editor = section.querySelector("#stream-editor");
  const editBtn = section.querySelector("#stream-edit");
  const input = section.querySelector("#stream-channel");
  const status = section.querySelector("#stream-status");
  const watch = section.querySelector("#stream-watch");

  const read = () => { try { return { data: readStoredOffice() || emptyOfficeData(), canSave: true }; } catch { return { data: emptyOfficeData(), canSave: false }; } };
  // "UC…" on its own, or inside a /channel/UC… link. Handles (@name) and custom URLs can't be turned into an ID here.
  function channelIdFrom(text) {
    const t = String(text || "").trim();
    const m = t.match(/(?:^|\/channel\/)(UC[\w-]{22})(?:[/?#]|$)/);
    return m ? m[1] : null;
  }

  let shownId = null;
  function render() {
    const { data } = read();
    const id = data.youtubeChannel?.id || null;
    watch.hidden = !id;
    editBtn.textContent = id ? "Change channel" : "Set channel";
    if (id) watch.href = `https://www.youtube.com/channel/${id}/live`;
    if (id === shownId && frame.childElementCount) return; // keep the player (and anything playing) as it is
    shownId = id;
    if (!id) {
      const empty = document.createElement("p");
      empty.className = "stream-empty";
      empty.textContent = "No YouTube channel set yet. Use Set channel to show the league's live stream here, or the latest one when you're not live.";
      frame.replaceChildren(empty);
      return;
    }
    const box = document.createElement("div");
    box.className = "stream-player";
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/videoseries?list=UULV${id.slice(2)}&rel=0`;
    iframe.title = "Latest league stream on YouTube";
    iframe.loading = "lazy";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
    box.append(iframe);
    frame.replaceChildren(box);
  }

  function save(change, message) {
    const { data, canSave } = read();
    if (!canSave) { status.textContent = "Saved league data couldn't be read, so the channel can't be changed here."; return false; }
    change(data);
    try { writeStoredOffice(data); } catch (error) { status.textContent = `Could not save: ${error.message}.`; return false; }
    status.textContent = message;
    render();
    return true;
  }

  editBtn.addEventListener("click", () => {
    const open = editor.hidden;
    editor.hidden = !open;
    editBtn.setAttribute("aria-expanded", String(open));
    if (open) { input.value = read().data.youtubeChannel?.id || ""; input.focus(); }
  });
  editor.addEventListener("submit", (event) => {
    event.preventDefault();
    const raw = input.value.trim();
    const id = channelIdFrom(raw);
    if (!id) {
      status.textContent = /@|\/c\/|\/user\//.test(raw)
        ? "That's a channel handle or custom link. Paste the channel ID instead (it starts with UC); the note below says where to find it."
        : "That doesn't look like a YouTube channel ID. It starts with UC and is 24 characters long.";
      return;
    }
    if (save((data) => { data.youtubeChannel = { id }; }, "Channel saved. The latest stream shows below.")) { editor.hidden = true; editBtn.setAttribute("aria-expanded", "false"); }
  });
  section.querySelector("#stream-clear").addEventListener("click", () => {
    if (save((data) => { delete data.youtubeChannel; }, "Channel removed.")) { input.value = ""; }
  });
  // Where the card sits: beside the week's games, under the Scoreboard, when the scoreboard area is showing;
  // otherwise in its own section below it.
  const card = section.querySelector(".stream-card");
  const slot = document.querySelector("#md-stream-slot");
  const matchday = document.querySelector("#matchday");
  const slate = document.querySelector("#md-slate");
  function place() {
    const beside = Boolean(slot && matchday && slate && !matchday.hidden && !slate.hidden);
    const target = beside ? slot : section.querySelector(".section-wrap");
    if (card.parentElement !== target) target.append(card);
    card.classList.toggle("is-beside", beside);
    section.hidden = beside;
    if (slot) slot.hidden = !beside;
  }
  if (matchday && slate) {
    const watcher = new MutationObserver(place);
    watcher.observe(matchday, { attributes: true, attributeFilter: ["hidden"] });
    watcher.observe(slate, { attributes: true, attributeFilter: ["hidden"] });
  }
  // The card's description sits behind a "?" next to its title (help-bubbles.js).
  const about = document.createElement("p");
  about.className = "section-subtitle";
  about.textContent = "Shows the stream that's live right now, or the most recent one. Nothing showing? The channel may not have any past live streams yet.";
  section.querySelector(".stream-card .recent-head").after(about);
  if (typeof addHelpBubble === "function") addHelpBubble(about);

  window.addEventListener("storage", (event) => { if (event.key === officeStorageKey) render(); });
  render();
  place();
})();
