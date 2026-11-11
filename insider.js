// Insider Wire (Overview): breaking-news style posts written automatically from the Transaction Log, in the voice of
// two made-up league insiders. Nothing is sent anywhere: each post is built in the browser from the transaction's
// type, teams, player and details, and the wording is picked from a set of templates (the same transaction always
// gets the same post). Uses teams.js / league-core.js globals.

const insiderReporters = [
  { id: "insider", name: "NBNFL Insider", handle: "@NBNFL_Insider", initials: "NI", color: "#e5322d" },
  { id: "sources", name: "Huddle Sources", handle: "@HuddleSources", initials: "HS", color: "#1f6fc5" }
];

// Small, stable hash so a transaction always gets the same reporter and wording.
function insiderHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const insiderPick = (list, seed, salt = 0) => list[(seed + salt * 7919) % list.length];

const insiderNickname = (teamId) => {
  if (teamId === freeAgentTeamId) return "free agency";
  const name = teamName(teamId) || teamId;
  return name.split(" ").pop();
};
const insiderTag = (teamId) => teamId === freeAgentTeamId ? "" : `#${insiderNickname(teamId)}`;
const insiderThe = (teamId) => `The ${insiderTag(teamId)}`;

// $84,000,000 -> $84M · $1,255,000 -> $1.255M · $450,000 -> $450K
function insiderMoney(amount) {
  if (!Number.isFinite(amount)) return "";
  if (amount >= 1e6) return `$${String(Number((amount / 1e6).toFixed(amount % 1e5 ? 3 : 1))).replace(/\.0$/, "")}M`;
  if (amount >= 1e3) return `$${Math.round(amount / 1e3)}K`;
  return `$${amount}`;
}
const insiderDollars = (text) => [...String(text).matchAll(/\$\s?([\d,]+(?:\.\d+)?)\s*([MK])?/gi)]
  .map(([, n, unit]) => Number(n.replace(/,/g, "")) * (unit?.toUpperCase() === "M" ? 1e6 : unit?.toUpperCase() === "K" ? 1e3 : 1));
const insiderPlain = (text) => String(text || "").replace(/\*\*/g, "").replace(/^[•\-]\s*/gm, "").replace(/\s+/g, " ").trim();

// Reads length / value / bonus / guarantees out of a signing or extension's details text.
function insiderContract(details) {
  const text = insiderPlain(details);
  const years = Number(text.match(/(\d+)[\s-]*years?/i)?.[1]) || null;
  const money = insiderDollars(text);
  const after = (word) => {
    const m = text.match(new RegExp(`\\$\\s?([\\d,]+(?:\\.\\d+)?)\\s*([MK])?\\s*(?:in\\s+)?(?:total\\s+)?${word}`, "i"));
    return m ? Number(m[1].replace(/,/g, "")) * (m[2]?.toUpperCase() === "M" ? 1e6 : m[2]?.toUpperCase() === "K" ? 1e3 : 1) : null;
  };
  return {
    years,
    total: money[0] ?? null,
    bonus: after("signing bonus"),
    guaranteed: after("(?:total\\s+)?guarantee(?:s|d)"),
    minimum: /minimum/i.test(text),
    vmb: /veteran minimum benefit/i.test(text)
  };
}
// "WR Malik McClain" -> { pos: "WR", name: "Malik McClain" }; also finds the position in a signing announcement.
function insiderPlayer(entry) {
  const text = insiderPlain(entry.details);
  const name = entry.player || "";
  const pos = name && text.match(new RegExp(`\\b([A-Z]{1,4})\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))?.[1];
  return { name, pos: pos && !/^(NFL|THE|AND)$/.test(pos) ? pos : "" };
}
const insiderWho = ({ pos, name }) => [pos, name].filter(Boolean).join(" ") || "a player";

// "2027 4th (PIT)" -> "a 2027 4th-round pick" · "WR Malik McClain" stays as is
function insiderAsset(item) {
  const pick = String(item).match(/^(\d{4})\s+(\d+(?:st|nd|rd|th))(?:\s*round)?\b/i);
  if (pick) return `a ${pick[1]} ${pick[2].toLowerCase()}-round pick`;
  return String(item).replace(/\s*\([A-Z]{2,3}\)\s*$/, "");
}
const insiderList = (items) => items.length <= 1 ? (items[0] || "future considerations")
  : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

function insiderTradeText(entry, seed) {
  const sides = (entry.sides || []).filter((s) => s.teamId !== freeAgentTeamId);
  if (sides.length < 2) {
    return `${insiderPick(["Trade!", "Trade alert:", "🚨 Trade:"], seed)} ${insiderPlain(entry.details).replace(/^trade\s*\d*:?\s*/i, "")}`;
  }
  const players = (side) => side.items.filter((i) => !/^\d{4}\s+\d+(st|nd|rd|th)/i.test(i));
  if (sides.length === 2) {
    // Lead with the team getting the player(s).
    const [a, b] = players(sides[1]).length >= players(sides[0]).length ? [sides[0], sides[1]] : [sides[1], sides[0]];
    const gets = insiderList(b.items.map(insiderAsset));
    const gives = insiderList(a.items.map(insiderAsset));
    return insiderPick([
      `Trade! ${insiderThe(a.teamId)} are acquiring ${gets} from the ${insiderTag(b.teamId)} for ${gives}, sources tell me.`,
      `🚨 Trade alert: ${insiderThe(b.teamId)} are sending ${gets} to the ${insiderTag(a.teamId)}. Coming back: ${gives}. Deal is done.`,
      `Sources: ${insiderThe(a.teamId)} land ${gets}, sending ${gives} to the ${insiderTag(b.teamId)}. Big swing.`,
      `${insiderThe(b.teamId)} and ${insiderTag(a.teamId)} have agreed to a trade: ${gets} heads to ${insiderNickname(a.teamId)} for ${gives}, per sources.`
    ], seed);
  }
  const lines = sides.map((s) => `${insiderTag(s.teamId)} send ${insiderList(s.items.map(insiderAsset))}`);
  return `${insiderPick(["Three-team trade!", "🚨 A three-way deal:", "Blockbuster, three teams:"], seed)} ${lines.join("; ")}. Sources say it's finalized.`;
}

function insiderSigningText(entry, seed) {
  const team = entry.teams.find((t) => t !== freeAgentTeamId) || entry.teams[0];
  const who = insiderWho(insiderPlayer(entry));
  const c = insiderContract(entry.details);
  const deal = [c.years ? `${c.years}-year` : "", c.total ? insiderMoney(c.total) : ""].filter(Boolean).join(", ");
  const kind = c.vmb ? " veteran minimum benefit" : c.minimum ? " minimum" : "";
  const extras = [c.bonus ? `${insiderMoney(c.bonus)} signing bonus` : "", c.guaranteed ? `${insiderMoney(c.guaranteed)} guaranteed` : ""].filter(Boolean).join(", ");
  const big = c.total >= 40e6;
  return insiderPick([
    `${big ? "Big payday: " : ""}${insiderThe(team)} are signing ${who} to a ${deal || "new"}${kind} deal, sources tell me.${extras ? ` Includes ${extras}.` : ""}`,
    `Free agent ${who} is signing with the ${insiderTag(team)}, per sources. ${deal ? `It's a ${deal}${kind} deal.` : ""}${extras ? ` ${extras}.` : ""}`,
    `${big ? "💰 " : ""}Sources: ${who} agrees to terms with the ${insiderTag(team)}${deal ? ` on a ${deal}${kind} contract` : ""}.${extras ? ` ${extras[0].toUpperCase()}${extras.slice(1)}.` : ""} ${insiderPick(["Done deal.", "Agent got it done.", "A nice fit."], seed, 1)}`,
    `${insiderThe(team)} add ${who}${deal ? ` on a ${deal}${kind} deal` : ""}, per me. ${extras ? `${extras[0].toUpperCase()}${extras.slice(1)}.` : insiderPick(["Depth move.", "Quietly a solid signing."], seed, 2)}`
  ], seed).replace(/\s+/g, " ").trim();
}

function insiderExtensionText(entry, seed) {
  const team = entry.teams[0];
  const who = insiderWho(insiderPlayer(entry));
  const c = insiderContract(entry.details);
  const deal = [c.years ? `${c.years}-year` : "", c.total ? insiderMoney(c.total) : ""].filter(Boolean).join(", ");
  const gtd = c.guaranteed ? `${insiderMoney(c.guaranteed)} guaranteed` : "";
  const aav = c.years && c.total ? insiderMoney(Math.round(c.total / c.years)) : "";
  return insiderPick([
    `Paid. ${insiderThe(team)} are giving ${who} a ${deal || "new"} extension, sources tell me.${gtd ? ` ${gtd[0].toUpperCase()}${gtd.slice(1)}.` : ""} He's not going anywhere.`,
    `${big(c) ? "💰 " : ""}Sources: ${who} and the ${insiderTag(team)} have agreed to a ${deal || "contract"} extension${gtd ? ` with ${gtd}` : ""}.${aav ? ` That's ${aav} per year.` : ""}`,
    `${insiderThe(team)} lock up ${who}: ${deal || "a new deal"}${gtd ? `, ${gtd}` : ""}, per sources. ${insiderPick(["Cornerstone money.", "Team gets its guy.", "Done deal."], seed, 1)}`,
    `Extension: ${who} is staying with the ${insiderTag(team)} on a ${deal || "new"} deal, per me.${gtd ? ` Includes ${gtd}.` : ""}`
  ], seed).replace(/\s+/g, " ").trim();
}
const big = (c) => c.total >= 40e6;

function insiderReleaseText(entry, seed) {
  const team = entry.teams[0];
  const who = insiderWho(insiderPlayer(entry));
  if (/signed to the practice squad/i.test(entry.details)) return insiderPick([
    `${insiderThe(team)} are releasing ${who} and bringing him back on the practice squad, sources tell me.`,
    `Sources: ${who} is staying with the ${insiderTag(team)}, moving to the practice squad.`
  ], seed).replace(/\s+/g, " ").trim();
  if (/placed on waivers \(to the practice squad/i.test(entry.details)) return insiderPick([
    `${insiderThe(team)} are waiving ${who} with the plan to bring him back on the practice squad, sources tell me. Other teams get the first shot.`,
    `Sources: ${insiderTag(team)} waive ${who}, hoping he clears for the practice squad.`
  ], seed).replace(/\s+/g, " ").trim();
  if (/placed on waivers/i.test(entry.details)) return insiderPick([
    `${insiderThe(team)} are waiving ${who}, sources tell me. He's on the wire for 24 hours.`,
    `Sources: ${insiderTag(team)} have waived ${who}. Teams have a day to put in a claim.`,
    `Roster move: ${who} waived by the ${insiderTag(team)}, per me. Watch the waiver wire.`
  ], seed).replace(/\s+/g, " ").trim();
  const dead = insiderDollars(entry.details)[0];
  const deadText = dead ? `${insiderMoney(dead)} in dead cap` : "";
  return insiderPick([
    `${insiderThe(team)} are releasing ${who}, sources tell me.${deadText ? ` The move leaves ${deadText}.` : ""} He'll hit the open market.`,
    `Sources: ${insiderTag(team)} have cut ${who}.${deadText ? ` ${deadText[0].toUpperCase()}${deadText.slice(1)}.` : ""} ${insiderPick(["Teams will call.", "Expect interest quickly.", "A surprise in some circles."], seed, 1)}`,
    `Roster move: ${insiderThe(team)} part ways with ${who}, per me.${deadText ? ` They'll carry ${deadText}.` : ""}`
  ], seed).replace(/\s+/g, " ").trim();
}

function insiderWaiverText(entry, seed) {
  const team = entry.teams[0];
  const who = insiderWho(insiderPlayer(entry));
  if (/cleared waivers and signed to the .* practice squad/i.test(entry.details)) return insiderPick([
    `${who} cleared waivers and is back with the ${insiderTag(team)} on their practice squad, sources tell me.`,
    `Sources: ${who} went unclaimed and signs to the ${insiderTag(team)} practice squad.`
  ], seed);
  if (/cleared waivers/i.test(entry.details)) return insiderPick([
    `${who} has cleared waivers and is a free agent, sources tell me. Open market now.`,
    `No takers: ${who} went unclaimed on waivers and is now a free agent, per sources.`,
    `Sources: ${who} clears waivers. Any team can sign him now.`
  ], seed);
  return insiderPick([
    `${insiderThe(team)} have claimed ${who} off waivers, sources tell me.`,
    `Waiver claim: ${who} is headed to the ${insiderTag(team)}, per sources.`,
    `Sources: ${insiderTag(team)} were awarded ${who} on waivers. Low-risk add.`
  ], seed);
}

function insiderRestructureText(entry, seed) {
  const team = entry.teams[0];
  const who = insiderWho(insiderPlayer(entry));
  const text = insiderPlain(entry.details);
  const [converted] = insiderDollars(text);
  const space = text.match(/creating\s+\$\s?([\d,]+)/i);
  const room = space ? insiderMoney(Number(space[1].replace(/,/g, ""))) : "";
  return insiderPick([
    `${insiderThe(team)} have restructured ${who}'s contract, sources tell me${converted ? `, converting ${insiderMoney(converted)} into a signing bonus` : ""}.${room ? ` That creates ${room} in cap space.` : ""} More room to work with.`,
    `Cap move: ${who} restructures with the ${insiderTag(team)}, per sources.${room ? ` ${room} freed up.` : ""} ${insiderPick(["Keep an eye on what's next.", "Sets up another move?", "Smart business."], seed, 1)}`,
    `Sources: ${insiderTag(team)} create${room ? ` ${room} of` : ""} cap space by restructuring ${who}.`
  ], seed).replace(/\s+/g, " ").trim();
}

function insiderPostFor(entry, builtins = insiderReporters) {
  const seed = insiderHash(entry.id);
  const reporter = builtins[seed % builtins.length];
  const text = entry.type === "trade" ? insiderTradeText(entry, seed)
    : entry.type === "signing" ? insiderSigningText(entry, seed)
    : entry.type === "extension" ? insiderExtensionText(entry, seed)
    : entry.type === "release" ? insiderReleaseText(entry, seed)
    : entry.type === "waiver" ? insiderWaiverText(entry, seed)
    : entry.type === "restructure" ? insiderRestructureText(entry, seed)
    : `Roster note${entry.teams[0] ? ` from the ${insiderTag(entry.teams[0])}` : ""}: ${entry.player ? `${entry.player} — ` : ""}${insiderPlain(entry.details)}`;
  return { id: entry.id, reporter, text, date: entry.date, createdAt: entry.createdAt, teams: entry.teams.filter((t) => t !== freeAgentTeamId), type: entry.type };
}

// The newest reports are the moves most recently added to the Transaction Log (entries are appended as they're
// recorded), not the latest dates: a move made today should lead even if the log already has later-dated entries
// (the sample league's season runs into December).
function insiderPosts(data, limit = 4) {
  // Automatic posts in Transaction Log order (newest recorded first) and the league's own posts, merged by when they
  // were made. Log entries without a creation time (e.g. imported ones) count as older than any written post.
  const builtins = insiderBuiltinReporters(data);
  const auto = (data.transactions || []).map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.index - a.index).slice(0, limit)
    .map(({ entry }, order) => {
      // A creation time in the future (e.g. the sample league's made-up dates) can't be compared, so it counts as older.
      const t = Date.parse(entry.createdAt || "");
      return { post: insiderPostFor(entry, builtins), time: Number.isFinite(t) && t <= Date.now() + 60000 ? t : -Infinity, order };
    });
  const reporters = insiderAllReporters(data);
  const custom = (data.insiderPosts || []).map((p) => ({
    post: { id: p.id, custom: true, reporter: reporters.find((r) => r.id === p.reporterId) || { id: "?", name: "League reporter", handle: "@NBNFL", initials: "NB", color: "#6b7f99" },
      text: p.text, date: p.date, createdAt: p.createdAt, teams: p.teams, type: "custom" },
    time: Date.parse(p.createdAt) || 0, order: -1 }));
  return [...custom, ...auto].sort((a, b) => b.time - a.time || a.order - b.order).slice(0, limit).map(({ post }) => post);
}

// Built-in reporters plus the league's own.
// The two automatic-report insiders, with any admin edits (News › Manage Reporters) applied.
function insiderBuiltinReporters(data) {
  const edits = data?.insiderBuiltinEdits || {};
  return insiderReporters.map((r) => {
    const e = edits[r.id];
    return e ? { ...r, ...e, initials: insiderInitials(e.name), edited: true } : r;
  });
}

function insiderAllReporters(data) {
  return [...insiderBuiltinReporters(data), ...(data.insiderReporters || []).map((r) => ({ ...r, initials: insiderInitials(r.name), custom: true }))];
}
const insiderInitials = (name) => String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";

function insiderWhen(post) {
  const [y, m, d] = post.date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today - day) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  if (days > 1 && days < 7) return `${days}d`;
  return day.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(day.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

function renderInsiderWire() {
  const list = document.querySelector("#insider-list");
  if (!list) return;
  let data = emptyOfficeData();
  try { data = readStoredOffice() || data; } catch { /* show the empty state */ }
  const posts = insiderPosts(data, Number(list.dataset.limit) || 4); // Overview shows 4; News › Insider Wire shows more
  if (!posts.length) {
    const empty = document.createElement("p");
    empty.className = "recent-empty";
    empty.textContent = "Quiet out there. Trades, signings, extensions, restructures and releases get reported here as soon as they hit the Transaction Log, along with posts written by the league.";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...posts.map((post) => {
    const card = document.createElement("article");
    card.className = `insider-post txn-${post.type}`;
    const head = document.createElement("div");
    head.className = "insider-head";
    const avatar = document.createElement("span");
    avatar.className = "insider-avatar";
    avatar.style.background = post.reporter.color;
    if (post.reporter.photo) {
      const img = document.createElement("img");
      img.src = post.reporter.photo;
      img.alt = "";
      img.addEventListener("error", () => { img.remove(); avatar.textContent = post.reporter.initials; }, { once: true });
      avatar.append(img);
    } else avatar.textContent = post.reporter.initials;
    avatar.setAttribute("aria-hidden", "true");
    const who = document.createElement("div");
    who.className = "insider-who";
    const name = document.createElement("strong");
    name.textContent = post.reporter.name;
    const check = document.createElement("span");
    check.className = "insider-check";
    check.setAttribute("aria-label", "League account");
    check.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path fill="currentColor" d="M22.5 12.5c0-1.6-.9-3-2.2-3.7.2-.4.2-.9.2-1.3 0-2.2-1.8-4-4-4-.5 0-.9.1-1.3.2C14.5 2.4 13.2 1.5 11.6 1.5S8.7 2.4 8 3.7c-.4-.1-.9-.2-1.3-.2-2.2 0-4 1.8-4 4 0 .5.1.9.2 1.3C1.6 9.5.7 10.9.7 12.5s.9 3 2.2 3.7c-.1.4-.2.9-.2 1.3 0 2.2 1.8 4 4 4 .5 0 .9-.1 1.3-.2.7 1.3 2 2.2 3.6 2.2s3-.9 3.6-2.2c.4.1.9.2 1.3.2 2.2 0 4-1.8 4-4 0-.5-.1-.9-.2-1.3 1.3-.7 2.2-2.1 2.2-3.7zm-12.2 4.4-4-4 1.4-1.4 2.6 2.6 5.8-5.8 1.4 1.4-7.2 7.2z"/></svg>';
    name.append(check);
    const handle = document.createElement("span");
    handle.className = "insider-handle";
    handle.textContent = `${post.reporter.handle} · ${insiderWhen(post)}`;
    who.append(name, handle);
    head.append(avatar, who);
    const text = document.createElement("p");
    text.className = "insider-text";
    // Hashtags in the accent color.
    for (const part of post.text.split(/(#[A-Za-z0-9]+)/)) {
      if (/^#[A-Za-z0-9]+$/.test(part)) { const tag = document.createElement("span"); tag.className = "insider-tag"; tag.textContent = part; text.append(tag); }
      else text.append(part);
    }
    const foot = document.createElement("div");
    foot.className = "insider-foot";
    const teams = document.createElement("span");
    teams.className = "insider-teams";
    for (const id of post.teams) {
      const link = document.createElement("a");
      link.href = `team.html?team=${encodeURIComponent(id)}`;
      link.title = teamName(id);
      link.append(typeof overviewLogo === "function" ? overviewLogo(id) : id);
      teams.append(link);
    }
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "workspace-button insider-copy";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", `Copy this ${post.reporter.name} post`);
    copy.addEventListener("click", async () => {
      const ok = await copyText(`${post.reporter.name} (${post.reporter.handle}): ${post.text}`);
      copy.textContent = ok ? "Copied ✓" : "Couldn't copy";
      setTimeout(() => { copy.textContent = "Copy"; }, 1600);
    });
    const tools = document.createElement("span");
    tools.className = "insider-tools";
    tools.append(copy);
    if (post.custom) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "workspace-button insider-copy";
      del.textContent = "Delete";
      del.dataset.deletePost = post.id;
      del.setAttribute("aria-label", `Delete this ${post.reporter.name} post`);
      tools.append(del);
    }
    foot.append(teams, tools);
    card.append(head, text, foot);
    return card;
  }));
}

// ---- Writing posts and managing the league's own reporters ----
function insiderSaveData(mutate, message) {
  const status = document.querySelector("#insider-status");
  let data;
  try { data = readStoredOffice() || emptyOfficeData(); } catch (error) { status.textContent = "Saved league data couldn't be read, so nothing was saved."; return false; }
  mutate(data);
  try { writeStoredOffice(data); } catch (error) { status.textContent = `Couldn't save: ${error.message}.`; return false; }
  status.textContent = message;
  renderInsiderWire();
  renderInsiderComposer(data);
  return true;
}

function renderInsiderComposer(data) {
  const form = document.querySelector("#insider-compose");
  if (!form) return;
  const select = form.elements.reporter;
  const keep = select.value;
  select.replaceChildren(...insiderAllReporters(data).map((r) => new Option(`${r.name} (${r.handle})`, r.id)), new Option("+ New reporter…", "__new"));
  select.value = [...select.options].some((o) => o.value === keep) ? keep : select.options[0].value;
  for (const name of ["team1", "team2"]) {
    const t = form.elements[name];
    const was = t.value;
    if (t.options.length !== nflTeams.length + 1) t.replaceChildren(new Option("No team", ""), ...nflTeams.map(({ id, name: n }) => new Option(n, id)));
    t.value = was;
  }
  document.querySelector("#insider-new-reporter").hidden = select.value !== "__new";
}

function insiderAvatarEl(reporter) {
  const avatar = document.createElement("span");
  avatar.className = "insider-avatar";
  avatar.style.background = reporter.color;
  if (reporter.photo) { const img = document.createElement("img"); img.src = reporter.photo; img.alt = ""; avatar.append(img); }
  else avatar.textContent = reporter.initials;
  return avatar;
}

// Shrinks an uploaded picture to a 128px square (cropped to the center) so it fits in browser storage.
function insiderResizePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("couldn't read the picture"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("that file isn't a picture the browser can open"));
      img.onload = () => {
        const size = 128, side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

(function setupInsiderComposer() {
  const form = document.querySelector("#insider-compose");
  const toggle = document.querySelector("#insider-compose-toggle");
  if (!form || !toggle) return;
  let pendingPhoto = "";
  const status = document.querySelector("#insider-status");
  const preview = document.querySelector("#insider-avatar-preview");
  const showPreview = () => {
    const name = form.elements.rName.value.trim() || "New Reporter";
    preview.replaceChildren(insiderAvatarEl({ name, initials: insiderInitials(name), color: form.elements.rColor.value, photo: pendingPhoto || (form.elements.rPhotoUrl.value.startsWith("https://") ? form.elements.rPhotoUrl.value : "") }));
  };
  const open = (yes) => {
    form.hidden = !yes;
    toggle.setAttribute("aria-expanded", String(yes));
    if (yes) { let data = emptyOfficeData(); try { data = readStoredOffice() || data; } catch { /* empty */ } renderInsiderComposer(data); showPreview(); form.elements.text.focus(); }
  };
  toggle.addEventListener("click", () => open(form.hidden));
  document.querySelector("#insider-cancel").addEventListener("click", () => { form.reset(); pendingPhoto = ""; status.textContent = ""; open(false); });
  form.elements.reporter.addEventListener("change", () => { document.querySelector("#insider-new-reporter").hidden = form.elements.reporter.value !== "__new"; showPreview(); });
  for (const name of ["rName", "rColor", "rPhotoUrl"]) form.elements[name].addEventListener("input", showPreview);
  form.elements.rPhoto.addEventListener("change", async () => {
    const file = form.elements.rPhoto.files[0];
    if (!file) { pendingPhoto = ""; showPreview(); return; }
    try { pendingPhoto = await insiderResizePhoto(file); status.textContent = ""; }
    catch (error) { pendingPhoto = ""; status.textContent = `Profile picture not used: ${error.message}.`; }
    showPreview();
  });
  const count = document.querySelector("#insider-count");
  form.elements.text.addEventListener("input", () => { count.textContent = `${form.elements.text.value.length} / 600`; });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) { status.textContent = "Write the post first."; form.elements.text.focus(); return; }
    let reporterId = form.elements.reporter.value;
    let newReporter = null;
    if (reporterId === "__new") {
      const name = form.elements.rName.value.trim();
      const handle = form.elements.rHandle.value.trim().replace(/^@+/, "").replace(/\s+/g, "");
      if (!name || !handle) { status.textContent = "Give the new reporter a name and a handle."; (name ? form.elements.rHandle : form.elements.rName).focus(); return; }
      const url = form.elements.rPhotoUrl.value.trim();
      newReporter = { id: newRecordId("reporter"), name, handle: `@${handle}`.slice(0, 30), color: form.elements.rColor.value };
      if (pendingPhoto) newReporter.photo = pendingPhoto; else if (url.startsWith("https://")) newReporter.photo = url;
      reporterId = newReporter.id;
    }
    const teams = [...new Set([form.elements.team1.value, form.elements.team2.value].filter(Boolean))];
    const ok = insiderSaveData((data) => {
      if (newReporter) data.insiderReporters = [...(data.insiderReporters || []), newReporter];
      data.insiderPosts = [...(data.insiderPosts || []), { id: newRecordId("post"), reporterId, text, teams, createdAt: new Date().toISOString(), date: localDateString() }].slice(-2000);
    }, "Posted to the Insider Wire.");
    if (ok) {
      form.elements.text.value = "";
      count.textContent = "0 / 600";
      if (newReporter) { form.elements.reporter.value = newReporter.id; document.querySelector("#insider-new-reporter").hidden = true; for (const n of ["rName", "rHandle", "rPhotoUrl"]) form.elements[n].value = ""; form.elements.rPhoto.value = ""; pendingPhoto = ""; }
    }
  });
})();

document.querySelector("#insider-list")?.addEventListener("click", async (event) => {
  const id = event.target.closest("[data-delete-post]")?.dataset.deletePost;
  if (!id) return;
  if (!await confirmAction("Delete this post from the Insider Wire?", { confirmLabel: "Delete post", danger: true })) return;
  insiderSaveData((data) => { data.insiderPosts = (data.insiderPosts || []).filter((p) => p.id !== id); }, "Post deleted.");
});

renderInsiderWire();
window.addEventListener("storage", (event) => { if (event.key === officeStorageKey) renderInsiderWire(); });
