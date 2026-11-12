// Home › Latest Stream: the league's YouTube channel, beside the week's games under the Scoreboard.
// Without an API key it embeds the channel's live-streams playlist (UULV + the channel ID without its "UC"), which
// YouTube keeps newest first. With an optional YouTube Data API key it asks YouTube for that playlist's newest video and
// its details (2 quota units, cached 5 minutes in this tab), so it can embed that exact stream, say LIVE NOW while the
// channel is live, and show the stream's date next to the title. The channel (and key) are saved with the league data
// (data.youtubeChannel = { id, apiKey? }). Uses league-core.js and help-bubbles.js.
(function streamCard() {
  const section = document.querySelector("#latest-stream");
  if (!section) return;
  const frame = section.querySelector("#stream-frame");
  const editor = section.querySelector("#stream-editor");
  const editBtn = section.querySelector("#stream-edit");
  const input = section.querySelector("#stream-channel");
  const keyInput = section.querySelector("#stream-key");
  const status = section.querySelector("#stream-status");
  const watch = section.querySelector("#stream-watch");
  const cacheKey = "nbf-stream-latest";

  const read = () => { try { return { data: readStoredOffice() || emptyOfficeData(), canSave: true }; } catch { return { data: emptyOfficeData(), canSave: false }; } };
  // "UC…" on its own, or inside a /channel/UC… link. Handles (@name) and custom URLs can't be turned into an ID here.
  function channelIdFrom(text) {
    const t = String(text || "").trim();
    const m = t.match(/(?:^|\/channel\/)(UC[\w-]{22})(?:[/?#]|$)/);
    return m ? m[1] : null;
  }

  // ---- the stream's date (needs the API key) ----
  const dateEl = document.createElement("span");
  dateEl.className = "stream-date";
  dateEl.hidden = true;
  async function latestStream(id, key) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && cached.id === id && Date.now() - cached.at < 5 * 60e3) return cached.info;
    } catch { /* no cache */ }
    const api = (path) => fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(key)}`).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message || `YouTube ${res.status}`);
      return body;
    });
    const list = await api(`playlistItems?part=contentDetails&maxResults=1&playlistId=UULV${id.slice(2)}`);
    const videoId = list.items?.[0]?.contentDetails?.videoId;
    let info = null;
    if (videoId) {
      const video = (await api(`videos?part=snippet,liveStreamingDetails&id=${videoId}`)).items?.[0];
      if (video) {
        const live = video.liveStreamingDetails || {};
        info = { videoId, title: video.snippet?.title || "", state: video.snippet?.liveBroadcastContent || "none",
          when: live.actualStartTime || live.scheduledStartTime || video.snippet?.publishedAt || video.contentDetails?.videoPublishedAt || null };
      }
    }
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ id, at: Date.now(), info })); } catch { /* fine */ }
    return info;
  }
  function showDate(info) {
    const when = info?.when ? new Date(info.when) : null;
    dateEl.classList.toggle("is-live", info?.state === "live");
    if (info?.state === "live") dateEl.textContent = "● LIVE NOW";
    else if (info?.state === "upcoming" && when) dateEl.textContent = `Starts ${when.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    else if (when) dateEl.textContent = when.toLocaleDateString("en-US", when.getFullYear() === new Date().getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
    else dateEl.textContent = "";
    dateEl.title = [info?.title, when ? when.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" }) : ""].filter(Boolean).join(" · ");
    dateEl.hidden = !dateEl.textContent;
  }

  function player(src) {
    const box = document.createElement("div");
    box.className = "stream-player";
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = "Latest league stream on YouTube";
    iframe.loading = "lazy";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
    box.append(iframe);
    return box;
  }

  let shown = null; // what the player is showing, so a re-render doesn't restart it
  async function render() {
    const { data } = read();
    const id = data.youtubeChannel?.id || null;
    const key = data.youtubeChannel?.apiKey || "";
    watch.hidden = !id;
    editBtn.textContent = id ? "Change channel" : "Set channel";
    if (id) watch.href = `https://www.youtube.com/channel/${id}/live`;
    if (!id) {
      shown = null;
      showDate(null);
      const empty = document.createElement("p");
      empty.className = "stream-empty";
      empty.textContent = "No YouTube channel set yet. Use Set channel to show the league's live stream here, or the latest one when you're not live.";
      frame.replaceChildren(empty);
      return;
    }
    let src = `https://www.youtube.com/embed/videoseries?list=UULV${id.slice(2)}&rel=0`;
    if (key) {
      try {
        const info = await latestStream(id, key);
        showDate(info);
        if (info?.videoId) src = `https://www.youtube.com/embed/${info.videoId}?rel=0`;
        if (status.dataset.keyError) { status.textContent = ""; delete status.dataset.keyError; }
      } catch (error) {
        showDate(null);
        status.textContent = `YouTube didn't accept the API key (${error.message}), so the stream's date can't be shown.`;
        status.dataset.keyError = "1";
      }
    } else showDate(null);
    if (shown === src && frame.querySelector("iframe")) return;
    shown = src;
    frame.replaceChildren(player(src));
  }

  function save(change, message) {
    const { data, canSave } = read();
    if (!canSave) { status.textContent = "Saved league data couldn't be read, so the channel can't be changed here."; return false; }
    change(data);
    try { writeStoredOffice(data); } catch (error) { status.textContent = `Could not save: ${error.message}.`; return false; }
    try { sessionStorage.removeItem(cacheKey); } catch { /* fine */ }
    status.textContent = message;
    render();
    return true;
  }

  editBtn.addEventListener("click", () => {
    const open = editor.hidden;
    editor.hidden = !open;
    editBtn.setAttribute("aria-expanded", String(open));
    if (open) { const c = read().data.youtubeChannel; input.value = c?.id || ""; keyInput.value = c?.apiKey || ""; input.focus(); }
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
    const apiKey = keyInput.value.trim();
    if (apiKey && !/^[\w-]{20,60}$/.test(apiKey)) { status.textContent = "That doesn't look like a YouTube API key (they start with AIza and are 39 characters long)."; return; }
    if (save((data) => { data.youtubeChannel = apiKey ? { id, apiKey } : { id }; }, "Channel saved.")) { editor.hidden = true; editBtn.setAttribute("aria-expanded", "false"); }
  });
  section.querySelector("#stream-clear").addEventListener("click", () => {
    if (save((data) => { delete data.youtubeChannel; }, "Channel removed.")) { input.value = ""; keyInput.value = ""; }
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

  // The card's description sits behind a "?" next to its title (help-bubbles.js); the stream's date goes after it.
  const about = document.createElement("p");
  about.className = "section-subtitle";
  about.textContent = "Shows the stream that's live right now, or the most recent one. Nothing showing? The channel may not have any past live streams yet. The date beside the title needs a YouTube API key (Change channel).";
  const head = section.querySelector(".stream-card .recent-head");
  head.after(about);
  if (typeof addHelpBubble === "function") addHelpBubble(about);
  const bubble = head.querySelector(".help-bubble");
  if (bubble) bubble.after(dateEl); else head.querySelector("h2").after(dateEl);

  window.addEventListener("storage", (event) => { if (event.key === officeStorageKey) render(); });
  setInterval(() => { if (!document.hidden && read().data.youtubeChannel?.apiKey) render(); }, 5 * 60e3 + 1000);
  render();
  place();
})();
