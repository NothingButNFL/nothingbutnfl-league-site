// Draft helpers shared by League History › Previous Drafts (drafts.js) and Season Information › Draft (draft-room.js):
// rounds and compensatory picks, pick labels, team tags and the reader for pasted drafts. Needs league-core.js.
const drRoundFor = (pick) => Math.min(7, Math.ceil(pick / 32));
// A "*" after a pick number marks a compensatory pick: it comes at the end of its round, after the 32 regular picks.
// Rounds are worked out from that: regular picks fill rounds 32 at a time (comp picks don't count toward the 32),
// and a comp pick belongs to the round of the regular pick before it. Picks whose round was typed by hand keep it.
function drRoundFrom(pick, compensatory, compsBefore) {
  const regularBefore = pick - 1 - compsBefore; // regular picks ahead of this one
  return Math.max(1, Math.min(7, compensatory ? Math.ceil(regularBefore / 32) : Math.floor(regularBefore / 32) + 1));
}
function drReround(list, year) {
  const yearPicks = list.filter((d) => d.year === year).sort((a, b) => a.pick - b.pick);
  let comps = 0;
  for (const d of yearPicks) {
    if (!d.roundManual) d.round = drRoundFrom(d.pick, d.compensatory, comps);
    if (d.compensatory) comps += 1;
  }
  return list;
}
const drPickText = (p) => `${ordinal(p.pick)}${p.compensatory ? "*" : ""}`;
const drParsePick = (text) => { const m = String(text || "").trim().match(/^(\d{1,3})\s*(\*?)$/); return m ? { pick: Number(m[1]), compensatory: Boolean(m[2]) } : null; };
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th"}`;

function drTeamTag(teamId) {
  const team = nflTeams.find(({ id }) => id === teamId);
  const tag = document.createElement("a");
  tag.className = "dr-team";
  tag.href = `team.html?team=${encodeURIComponent(teamId)}`;
  tag.title = team?.name || teamId;
  const img = document.createElement("img");
  img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team?.logo || teamId.toLowerCase()}.png`;
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => img.remove(), { once: true });
  tag.append(img, teamId);
  return tag;
}

// ---------- Reading a pasted draft ----------
// Accepts one pick per line: Pick, Team, Player, Position, School (or Round first), separated by tabs, commas, pipes,
// semicolons or runs of spaces, and copes with what drafts copied from websites and spreadsheets usually contain:
// "1.", "#1", "1st", "Pick 1", "97*" or "97 (comp)" pick numbers; teams with trade notes ("Rams (from Falcons)",
// "HOU via CLE"); "Smith, Jr." names split by a comma; and "Round 1" heading lines. Returns { picks, errors } where
// each error says which line and why.
const drPositions = new Set(["QB", "RB", "HB", "FB", "WR", "TE", "OT", "T", "OG", "G", "C", "OL", "IOL", "DE", "EDGE", "DT", "DL", "NT", "LB", "ILB", "OLB", "MLB", "CB", "DB", "S", "FS", "SS", "SAF", "K", "P", "LS", "ATH", "KR", "PR"]);
const drSuffix = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;

function drPickToken(text) {
  const raw = String(text || "").trim();
  const comp = /\*|\bcomp(ensatory)?\b|\(c\)/i.test(raw);
  const m = raw.replace(/^(pick|no\.?|#)\s*/i, "").match(/^(\d{1,3})(?:st|nd|rd|th)?\.?\s*\*?(?:\s|$|\(|\*)/i) || raw.replace(/^(pick|no\.?|#)\s*/i, "").match(/^(\d{1,3})(?:st|nd|rd|th)?\.?\*?$/i);
  return m ? { pick: Number(m[1]), compensatory: comp } : null;
}
function drTeamToken(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const clean = raw.replace(/\s*[([].*$/, "").replace(/\s+(via|from|thru|through)\b.*$/i, "").replace(/[*†‡]+$/, "").trim();
  return lookupTeamId(clean) || lookupTeamId(raw);
}
// The team a traded pick came from: "Chicago Bears (CAR)", "Bears (from Panthers)", "CHI via CAR" → "CAR".
function drFromToken(text) {
  const raw = String(text || "");
  const m = raw.match(/[([]\s*(?:from|via|thru|through)?\s*([^)\]]+?)\s*[)\]]/i) || raw.match(/\b(?:via|from|thru|through)\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split(/\s*(?:,|\/|\bthrough\b|\bvia\b|\bthru\b)\s*/i).filter(Boolean); // first team listed = where it came from
  return lookupTeamId(parts[0].replace(/^from\s+/i, "")) || null;
}

function drSplit(line) {
  for (const sep of ["\t", "|", ";", ","]) if (line.includes(sep)) return line.split(sep).map((c) => c.trim());
  const wide = line.trim().split(/\s{2,}/);
  return wide.length >= 3 ? wide : null; // single spaces only: read word by word
}

function drParseLine(line) {
  let cells = drSplit(line);
  let round = null;
  if (cells) {
    cells = cells.filter((c, i) => c !== "" || i === 0);
    // Round first: two leading numbers ("1, 1, …" or "1  32  …").
    let roundComp = false;
    if (cells.length >= 4 && /^\d{1,2}\s*\*?$/.test(cells[0]) && drPickToken(cells[1]) && !drTeamToken(cells[1])) { round = Number.parseInt(cells[0], 10); roundComp = /\*/.test(cells[0]); cells = cells.slice(1); }
    const pick = drPickToken(cells[0]);
    if (!pick) return { error: "no pick number at the start" };
    if (roundComp) pick.compensatory = true; // "3*, 97, …": a comp pick in round 3
    const teamId = drTeamToken(cells[1]);
    if (!teamId) {
      // "1. Bears - Caleb Williams, QB, USC": pick, team and player share the first cell.
      const head = drWords(cells[0], round);
      if (head.error) return { error: `team "${cells[1] || ""}" not recognised` };
      const [position, ...school] = cells.slice(1);
      return { ...head, position: head.position || position || "", college: [head.college, ...school].filter(Boolean).join(", ") };
    }
    let rest = cells.slice(2);
    if (rest.length > 1 && drSuffix.test(rest[1])) rest = [`${rest[0]} ${rest[1]}`, ...rest.slice(2)]; // "Smith, Jr."
    const [player, position, ...school] = rest;
    if (!player) return { error: "no player name" };
    return { round, ...pick, teamId, fromTeam: drFromToken(cells[1]), player, position: position || "", college: school.filter(Boolean).join(", ") };
  }
  return drWords(line, round);
}

// Word by word: pick, team (1-3 words), player…, position, school… ("-" separators are ignored).
function drWords(text, round = null) {
  let words = text.trim().replace(/\s+[-–—]+\s+/g, " ").split(/\s+/);
  if (/^\d{1,2}$/.test(words[0]) && words[1] && drPickToken(words[1]) && !drTeamToken(words[1])) { round = Number(words[0]); words = words.slice(1); }
  const pick = drPickToken(words[0]);
  if (!pick) return { error: "no pick number at the start" };
  words = words.slice(1);
  if (words[0] === "*") words = words.slice(1);
  let teamId = null, used = 0;
  for (const n of [3, 2, 1]) { teamId = words.length > n ? drTeamToken(words.slice(0, n).join(" ")) : null; if (teamId) { used = n; break; } }
  if (!teamId) return { error: `team "${words.slice(0, 2).join(" ")}" not recognised` };
  words = words.slice(used);
  let fromTeam = null;
  if (words[0] && /^[([]/.test(words[0])) { // "(CAR)" or "(from Carolina Panthers)" after the team
    let end = words.findIndex((w) => /[)\]]$/.test(w));
    if (end === -1) end = 0;
    fromTeam = drFromToken(words.slice(0, end + 1).join(" "));
    words = words.slice(end + 1);
  }
  const posAt = words.findIndex((w, i) => i > 0 && drPositions.has(w.toUpperCase().replace(/[^A-Z]/g, "")));
  const player = (posAt === -1 ? words : words.slice(0, posAt)).join(" ");
  if (!player) return { error: "no player name" };
  return { round, ...pick, teamId, fromTeam, player, position: posAt === -1 ? "" : words[posAt].toUpperCase(), college: posAt === -1 ? "" : words.slice(posAt + 1).join(" ") };
}

function drParse(text, year) {
  const picks = [], errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // Headings and header rows: "Round 1", "Round 2 -", "Pick, Team, Player…", "RD PICK TEAM…"
    if (/^(round|rd)\s*\d*\s*[-–:]?\s*$/i.test(trimmed) || /^(round|rnd|rd|pick|pk|no\.?|#|ovr|overall)\b[^\d]*$/i.test(trimmed)) return;
    const row = drParseLine(trimmed);
    if (row.error || !isIntegerInRange(row.pick, 1, 400)) {
      errors.push({ line: i + 1, text: trimmed.slice(0, 90), why: row.error || "pick number out of range" });
      return;
    }
    const entry = { id: newRecordId("draft"), year, round: row.round && isIntegerInRange(row.round, 1, 20) ? row.round : 1, pick: row.pick, teamId: row.teamId, player: row.player.slice(0, 70) };
    if (row.compensatory) entry.compensatory = true;
    if (row.fromTeam && row.fromTeam !== row.teamId) entry.fromTeam = row.fromTeam;
    if (row.round) entry.roundManual = true;
    if (row.position) entry.position = row.position.slice(0, 10);
    if (row.college) entry.college = row.college.slice(0, 80);
    picks.push(entry);
  });
  drReround(picks, year);
  return { picks, errors };
}
