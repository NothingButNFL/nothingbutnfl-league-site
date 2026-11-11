const officeStorageKey = "nothingbutfootball-front-office-v1";
const nflTeams = [
  { id: "ARI", name: "Arizona Cardinals", logo: "ari" },
  { id: "ATL", name: "Atlanta Falcons", logo: "atl" },
  { id: "BAL", name: "Baltimore Ravens", logo: "bal" },
  { id: "BUF", name: "Buffalo Bills", logo: "buf" },
  { id: "CAR", name: "Carolina Panthers", logo: "car" },
  { id: "CHI", name: "Chicago Bears", logo: "chi" },
  { id: "CIN", name: "Cincinnati Bengals", logo: "cin" },
  { id: "CLE", name: "Cleveland Browns", logo: "cle" },
  { id: "DAL", name: "Dallas Cowboys", logo: "dal" },
  { id: "DEN", name: "Denver Broncos", logo: "den" },
  { id: "DET", name: "Detroit Lions", logo: "det" },
  { id: "GB", name: "Green Bay Packers", logo: "gb" },
  { id: "HOU", name: "Houston Texans", logo: "hou" },
  { id: "IND", name: "Indianapolis Colts", logo: "ind" },
  { id: "JAX", name: "Jacksonville Jaguars", logo: "jax" },
  { id: "KC", name: "Kansas City Chiefs", logo: "kc" },
  { id: "LV", name: "Las Vegas Raiders", logo: "lv" },
  { id: "LAC", name: "Los Angeles Chargers", logo: "lac" },
  { id: "LAR", name: "Los Angeles Rams", logo: "lar" },
  { id: "MIA", name: "Miami Dolphins", logo: "mia" },
  { id: "MIN", name: "Minnesota Vikings", logo: "min" },
  { id: "NE", name: "New England Patriots", logo: "ne" },
  { id: "NO", name: "New Orleans Saints", logo: "no" },
  { id: "NYG", name: "New York Giants", logo: "nyg" },
  { id: "NYJ", name: "New York Jets", logo: "nyj" },
  { id: "PHI", name: "Philadelphia Eagles", logo: "phi" },
  { id: "PIT", name: "Pittsburgh Steelers", logo: "pit" },
  { id: "SF", name: "San Francisco 49ers", logo: "sf" },
  { id: "SEA", name: "Seattle Seahawks", logo: "sea" },
  { id: "TB", name: "Tampa Bay Buccaneers", logo: "tb" },
  { id: "TEN", name: "Tennessee Titans", logo: "ten" },
  { id: "WAS", name: "Washington Commanders", logo: "wsh" }
];

const teamsDropdown = document.querySelector("#teams-dropdown");
if (teamsDropdown) {
  for (const team of nflTeams) {
    const link = document.createElement("a");
    link.className = "team-menu-link";
    link.href = `team.html?team=${encodeURIComponent(team.id)}`;
    link.setAttribute("role", "menuitem");

    const logoWrap = document.createElement("span");
    logoWrap.className = "team-menu-logo";
    logoWrap.setAttribute("aria-hidden", "true");
    const initials = document.createElement("span");
    initials.className = "team-menu-fallback";
    initials.textContent = team.id;
    const image = document.createElement("img");
    image.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team.logo}.png`;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.hidden = true;
      initials.hidden = false;
    }, { once: true });
    initials.hidden = true;
    logoWrap.append(image, initials);

    const name = document.createElement("span");
    name.textContent = team.name.slice(team.name.lastIndexOf(" ") + 1);
    const abbreviation = document.createElement("small");
    abbreviation.textContent = team.id;
    link.append(logoWrap, name, abbreviation);
    teamsDropdown.append(link);
  }
}

const teamsMenu = document.querySelector(".teams-menu");
const teamsTrigger = document.querySelector(".teams-trigger");
// In the desktop sidebar, menu groups stay open until their own button is clicked again.
const sidebarLayout = window.matchMedia("(min-width: 1181px)");
const adminMenu = document.querySelector(".admin-menu:not(.season-menu)");
const adminTrigger = adminMenu?.querySelector(".admin-trigger");
const adminDropdown = document.querySelector("#admin-dropdown");
const mobileMenuToggle = document.querySelector(".menu-toggle");
const siteNavigation = document.querySelector("#primary-nav");

function closeTeamsMenu() {
  if (!teamsMenu || !teamsTrigger) return;
  teamsMenu.classList.remove("is-open");
  teamsTrigger.setAttribute("aria-expanded", "false");
}

if (teamsMenu && teamsTrigger) {
  teamsTrigger.addEventListener("click", () => {
    const open = teamsTrigger.getAttribute("aria-expanded") === "true";
    teamsTrigger.setAttribute("aria-expanded", String(!open));
    teamsMenu.classList.toggle("is-open", !open);
  });
  teamsDropdown.setAttribute("role", "menu");
  teamsTrigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      teamsTrigger.setAttribute("aria-expanded", "true");
      teamsMenu.classList.add("is-open");
      teamsDropdown.querySelector("a")?.focus();
    }
  });
  teamsMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeTeamsMenu();
      teamsTrigger.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!teamsMenu.contains(event.target)) closeTeamsMenu();
  });
}

function closeAdminMenu() {
  if (!adminMenu || !adminTrigger) return;
  adminMenu.classList.remove("is-open");
  adminTrigger.setAttribute("aria-expanded", "false");
}

if (adminMenu && adminTrigger && adminDropdown) {
  adminTrigger.addEventListener("click", () => {
    const open = adminTrigger.getAttribute("aria-expanded") === "true";
    adminTrigger.setAttribute("aria-expanded", String(!open));
    adminMenu.classList.toggle("is-open", !open);
  });
  adminDropdown.setAttribute("role", "menu");
  adminTrigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      adminTrigger.setAttribute("aria-expanded", "true");
      adminMenu.classList.add("is-open");
      adminDropdown.querySelector("a")?.focus();
    }
  });
  adminMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAdminMenu();
      adminTrigger.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!adminMenu.contains(event.target) && !sidebarLayout.matches) closeAdminMenu();
  });
}

// Grouped dropdowns ("Front Office", "Season Information", "League History"): every .season-menu works the same way.
const groupMenus = [...document.querySelectorAll(".season-menu")].map((menu) => ({
  menu, trigger: menu.querySelector(".season-trigger"), dropdown: menu.querySelector(".season-dropdown")
})).filter(({ trigger, dropdown }) => trigger && dropdown);
function closeGroupMenu({ menu, trigger }) {
  menu.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
}
function closeSeasonMenu() { groupMenus.forEach(closeGroupMenu); }
for (const group of groupMenus) {
  const { menu, trigger, dropdown } = group;
  dropdown.setAttribute("role", "menu");
  trigger.addEventListener("click", () => {
    const open = trigger.getAttribute("aria-expanded") === "true";
    if (!sidebarLayout.matches) groupMenus.forEach((other) => { if (other !== group) closeGroupMenu(other); });
    trigger.setAttribute("aria-expanded", String(!open));
    menu.classList.toggle("is-open", !open);
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      trigger.setAttribute("aria-expanded", "true");
      menu.classList.add("is-open");
      dropdown.querySelector("a")?.focus();
    }
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeGroupMenu(group); trigger.focus(); }
  });
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !sidebarLayout.matches) closeGroupMenu(group);
  });
}
// Collapse button for the desktop sidebar (icons only when collapsed). Remembered in this browser.
const collapseKey = "nbf-sidebar-collapsed";
const siteHeader = document.querySelector(".site-header");
function setSidebarCollapsed(collapsed, remember = true) {
  document.documentElement.classList.toggle("nav-collapsed", collapsed);
  const button = document.querySelector(".sidebar-collapse");
  if (button) {
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    button.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    button.querySelector(".sidebar-collapse-label").textContent = collapsed ? "Expand" : "Collapse";
  }
  if (remember) { try { localStorage.setItem(collapseKey, collapsed ? "1" : "0"); } catch { /* storage unavailable */ } }
}
if (siteHeader) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sidebar-collapse";
  button.setAttribute("aria-controls", "primary-nav");
  const icon = document.createElement("span");
  icon.className = "sidebar-collapse-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "«";
  const label = document.createElement("span");
  label.className = "sidebar-collapse-label";
  button.append(icon, label);
  siteHeader.append(button);
  button.addEventListener("click", () => setSidebarCollapsed(!document.documentElement.classList.contains("nav-collapsed")));
  // Hover names for icons while collapsed.
  siteHeader.querySelectorAll(".primary-nav > a, .teams-trigger, .admin-trigger").forEach((item) => {
    const name = item.querySelector(".nav-label")?.textContent.trim();
    if (name && !item.title) item.title = name;
  });
  let saved = false;
  try { saved = localStorage.getItem(collapseKey) === "1"; } catch { /* storage unavailable */ }
  setSidebarCollapsed(saved, false);
  // Opening a group (not Teams) from the collapsed sidebar expands it first.
  siteHeader.addEventListener("click", (event) => {
    if (!sidebarLayout.matches || !document.documentElement.classList.contains("nav-collapsed")) return;
    if (event.target.closest(".admin-trigger")) setSidebarCollapsed(false);
  }, true);
}

// Site theme picker (bottom of the sidebar / mobile bar): NBNFL (navy), Dark (gray), Light, Neon, then the 32 NFL
// team themes. Remembered in this browser. Team themes use theme-team.css, where every NBNFL blue is a --tm-RRGGBB
// variable; the variables are worked out here from the team's colors and also saved so each page's head script
// can apply them before it paints.
const themeKey = "nbf-theme";
const themeVarsKey = "nbf-theme-vars";
const themeModes = [
  { id: "dark", label: "NBNFL", color: "#071a33", swatch: ["#071a33", "#8fd0ff"] },
  { id: "gray", label: "Dark", color: "#18191b", swatch: ["#18191b", "#d5d7db"] },
  { id: "light", label: "Light", color: "#ffffff", swatch: ["#ffffff", "#0c2b50"] },
  // Neon: violet-black surfaces, hot pink accents, cyan secondary text; theme-neon.css adds the glow and haze.
  { id: "neon", label: "Neon", color: "#0b0318", swatch: ["#ff2bd6", "#00e5ff"],
    palette: { base: "#2a0a5e", accent: "#ff3fd8", textHue: 186, textSat: 1.5, surfaceLight: 0.72 } }
];
// base: the color the page surfaces are tinted with; accent: links, highlights and active states.
const teamThemePalettes = {
  ARI: ["#97233f", "#ffb612"], ATL: ["#121212", "#e0283c"], BAL: ["#241773", "#c9a227"], BUF: ["#00338d", "#e0283c"],
  CAR: ["#121212", "#0085ca"], CHI: ["#0b162a", "#e8590c"], CIN: ["#121212", "#fb4f14"], CLE: ["#311d00", "#ff3c00"],
  DAL: ["#003594", "#b0b7bc"], DEN: ["#002244", "#fb4f14"], DET: ["#0076b6", "#b0b7bc"], GB: ["#203731", "#ffb612"],
  HOU: ["#03202f", "#e0283c"], IND: ["#002c5f", "#a2aaad"], JAX: ["#006778", "#d7a22a"], KC: ["#e31837", "#ffb81c"],
  LV: ["#121212", "#a5acaf"], LAC: ["#0080c6", "#ffc20e"], LAR: ["#003594", "#ffd100"], MIA: ["#008e97", "#fc4c02"],
  MIN: ["#4f2683", "#ffc62f"], NE: ["#002244", "#e0283c"], NO: ["#121212", "#d3bc8d"], NYG: ["#0b2265", "#e0283c"],
  NYJ: ["#125740", "#ffffff"], PHI: ["#004c54", "#a5acad"], PIT: ["#121212", "#ffb612"], SF: ["#aa0000", "#b3995d"],
  SEA: ["#002244", "#69be28"], TB: ["#d50a0a", "#b1babf"], TEN: ["#0c2340", "#4b92db"], WAS: ["#5a1414", "#ffb612"]
};
const teamThemeColors = {"103261":[215,0.717,0.222,"s"],"142129":[203,0.344,0.12,"s"],"174477":[212,0.676,0.278,"s"],"334149":[202,0.177,0.243,"s"],"405057":[198,0.152,0.296,"s"],"030c1a":[217,0.793,0.057,"s"],"07162b":[215,0.72,0.098,"s"],"071a33":[214,0.759,0.114,"s"],"0a2647":[212,0.753,0.159,"s"],"0c151b":[204,0.385,0.076,"s"],"0c2b50":[213,0.739,0.18,"s"],"0f3460":[213,0.73,0.218,"s"],"101a22":[207,0.36,0.098,"s"],"10335d":[213,0.706,0.214,"s"],"111b22":[205,0.333,0.1,"s"],"123f73":[212,0.729,0.261,"s"],"18262d":[200,0.304,0.135,"s"],"1b2a32":[201,0.299,0.151,"s"],"1c4d85":[212,0.652,0.316,"s"],"1d3a5f":[214,0.532,0.243,"s"],"1f6fc5":[211,0.728,0.447,"s"],"264a75":[213,0.51,0.304,"s"],"29363b":[197,0.18,0.196,"s"],"29363e":[203,0.204,0.202,"s"],"31527a":[213,0.427,0.335,"s"],"39474e":[200,0.156,0.265,"s"],"4f6b8f":[214,0.288,0.435,"s"],"54749b":[213,0.297,0.469,"s"],"6b7f99":[214,0.184,0.51,"s"],"6d8197":[211,0.168,0.51,"s"],"6d84a3":[214,0.227,0.533,"s"],"8ca5c5":[214,0.329,0.661,"t"],"8fd0ff":[205,1,0.78,"a"],"9fb4cf":[214,0.333,0.718,"t"],"c5d5e8":[213,0.432,0.841,"t"],"c9d8ea":[213,0.44,0.853,"t"],"d7e8ff":[215,1,0.922,"t"],"dbe7f5":[212,0.565,0.91,"t"],"e6eef9":[215,0.613,0.939,"t"],"eef1f6":[218,0.308,0.949,"t"]}; // generated by tools/build-themes.js
const teamThemes = nflTeams.map(({ id, name }) => ({ id: `team-${id}`, teamId: id, label: name, swatch: teamThemePalettes[id] }))
  .sort((a, b) => a.label.localeCompare(b.label));
const allThemes = [...themeModes, ...teamThemes];

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l, 0];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l, d];
}
function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}
// The --tm-RRGGBB values ("r g b") for a palette: base tints the surfaces, accent is links and highlights.
// Optional: textHue/textSat give muted text its own hue; surfaceLight darkens (<1) the surfaces.
function paletteThemeVars({ base, accent, textHue = null, textSat = 0.8, surfaceLight = 1 }) {
  const [bh, , , chroma] = hexToHsl(base);
  const tint = Math.min(1, chroma / 0.17); // black-based teams get neutral grays
  const [ah, as, al] = hexToHsl(accent);
  const vars = {};
  for (const [key, [, s, l, kind]] of Object.entries(teamThemeColors)) {
    let rgb;
    if (kind === "a") rgb = hslToRgb(ah, as, Math.min(0.88, Math.max(0.64, al) - (0.78 - l)));
    else if (kind === "t") rgb = hslToRgb(textHue ?? bh, Math.min(1, s * (textHue === null ? tint : 1) * textSat), l);
    else rgb = hslToRgb(bh, s * tint, l * surfaceLight);
    vars[`--tm-${key}`] = rgb.join(" ");
  }
  return vars;
}
const teamThemeVars = (teamId) => paletteThemeVars({ base: teamThemePalettes[teamId][0], accent: teamThemePalettes[teamId][1] });
const themeVarsFor = (choice) => choice.teamId ? teamThemeVars(choice.teamId) : choice.palette ? paletteThemeVars(choice.palette) : null;
const findTheme = (id) => allThemes.find((t) => t.id === id);
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  return findTheme(t) ? t : "dark";
}
function applyThemeVars(theme) {
  const style = document.documentElement.style;
  for (const prop of [...style]) if (prop.startsWith("--tm-")) style.removeProperty(prop);
  const choice = findTheme(theme);
  const vars = choice && themeVarsFor(choice);
  if (!vars) { try { localStorage.removeItem(themeVarsKey); } catch { /* storage unavailable */ } return null; }
  for (const [prop, value] of Object.entries(vars)) style.setProperty(prop, value);
  try { localStorage.setItem(themeVarsKey, Object.entries(vars).map(([p, v]) => `${p}:${v}`).join(";")); } catch { /* storage unavailable */ }
  return vars;
}
const themeLogoUrl = (teamId) => `https://a.espncdn.com/i/teamlogos/nfl/500/${nflTeams.find(({ id }) => id === teamId).logo}.png`;
// A round swatch in the theme's two colors; team themes also show the team logo on top (the colors stay if it can't load).
function fillThemeSwatch(swatch, choice) {
  swatch.style.background = `linear-gradient(135deg, ${choice.swatch[0]} 0 50%, ${choice.swatch[1]} 50% 100%)`;
  swatch.classList.toggle("has-logo", Boolean(choice.teamId));
  let logo = swatch.querySelector("img");
  if (!choice.teamId) { logo?.remove(); return; }
  if (!logo) {
    logo = document.createElement("img");
    logo.alt = "";
    logo.addEventListener("error", () => { logo.remove(); swatch.classList.remove("has-logo"); });
    swatch.append(logo);
  }
  logo.src = themeLogoUrl(choice.teamId);
}

function setTheme(theme) {
  const choice = findTheme(theme) || themeModes[0];
  document.documentElement.dataset.theme = choice.id;
  try { localStorage.setItem(themeKey, choice.id); } catch { /* storage unavailable */ }
  const vars = applyThemeVars(choice.id);
  const pageColor = vars ? `rgb(${vars["--tm-071a33"].replace(/ /g, ", ")})` : choice.color;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", pageColor);
  document.querySelectorAll(".theme-picker").forEach((picker) => {
    picker.querySelector(".theme-picker-name").textContent = choice.label;
    picker.title = `Theme: ${choice.label}`;
    picker.setAttribute("aria-label", `Site theme: ${choice.label}`);
    fillThemeSwatch(picker.querySelector(".theme-picker-swatch"), choice);
  });
  document.querySelectorAll("#theme-menu [role=option]").forEach((option) => {
    const selected = option.dataset.theme === choice.id;
    option.setAttribute("aria-selected", String(selected));
    option.classList.toggle("is-selected", selected);
  });
}

// The theme dropdown: a list with each theme's swatch (and team logos), opened from the picker button.
function buildThemeMenu(button) {
  const menu = document.createElement("div");
  menu.id = "theme-menu";
  menu.className = "theme-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Site theme");
  menu.tabIndex = -1;
  menu.hidden = true;
  const option = (choice) => {
    const item = document.createElement("div");
    item.className = "theme-option";
    item.id = `theme-option-${choice.id}`;
    item.setAttribute("role", "option");
    item.dataset.theme = choice.id;
    const swatch = document.createElement("span");
    swatch.className = "theme-picker-swatch";
    swatch.setAttribute("aria-hidden", "true");
    fillThemeSwatch(swatch, choice);
    const label = document.createElement("span");
    label.className = "theme-option-label";
    label.textContent = choice.label;
    const check = document.createElement("span");
    check.className = "theme-option-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    item.append(swatch, label, check);
    return item;
  };
  const heading = document.createElement("div");
  heading.className = "theme-menu-heading";
  heading.setAttribute("role", "presentation");
  heading.textContent = "NFL teams";
  menu.append(...themeModes.map(option), heading, ...teamThemes.map(option));
  const options = () => [...menu.querySelectorAll("[role=option]")];
  let active = null;
  const setActive = (item) => {
    active?.classList.remove("is-active");
    active = item;
    if (!item) { menu.removeAttribute("aria-activedescendant"); return; }
    item.classList.add("is-active");
    menu.setAttribute("aria-activedescendant", item.id);
    item.scrollIntoView({ block: "nearest" });
  };
  const place = () => {
    if (menu.hidden) return;
    const rect = button.getBoundingClientRect();
    const width = Math.max(240, Math.min(300, window.innerWidth - 16));
    menu.style.width = `${width}px`;
    const room = { below: window.innerHeight - rect.bottom - 12, above: rect.top - 12 };
    const collapsedSidebar = rect.width < 60 && rect.left < 100 && window.innerWidth > 1180;
    const maxHeight = Math.min(520, Math.max(room.below, room.above, 200));
    menu.style.maxHeight = `${maxHeight}px`;
    const height = Math.min(menu.scrollHeight, maxHeight);
    let top, left;
    if (collapsedSidebar) { left = rect.right + 8; top = Math.min(rect.bottom - height, window.innerHeight - height - 8); }
    else {
      left = Math.min(rect.left, window.innerWidth - width - 8);
      top = room.below >= height || room.below >= room.above ? rect.bottom + 6 : rect.top - 6 - height;
    }
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  };
  const open = () => {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    place();
    setActive(options().find((o) => o.dataset.theme === currentTheme()) || options()[0]);
    menu.focus({ preventScroll: true });
  };
  const close = (focusButton = true) => {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    setActive(null);
    if (focusButton) button.focus();
  };
  const choose = (item) => { if (item) setTheme(item.dataset.theme); close(); };
  button.addEventListener("click", () => (menu.hidden ? open() : close()));
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); open(); }
  });
  menu.addEventListener("click", (event) => choose(event.target.closest("[role=option]")));
  menu.addEventListener("mousemove", (event) => { const item = event.target.closest("[role=option]"); if (item && item !== active) setActive(item); });
  let typed = "", typedAt = 0;
  menu.addEventListener("keydown", (event) => {
    const list = options();
    const index = list.indexOf(active);
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(list[Math.min(list.length - 1, index + 1)]); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(list[Math.max(0, index - 1)]); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); setActive(event.key === "Home" ? list[0] : list[list.length - 1]); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") close(false);
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Type a team name to jump to it.
      typed = Date.now() - typedAt < 700 ? typed + event.key.toLowerCase() : event.key.toLowerCase();
      typedAt = Date.now();
      const match = list.find((o) => o.textContent.toLowerCase().startsWith(typed))
        || list.find((o) => o.textContent.toLowerCase().split(" ").some((w) => w.startsWith(typed)));
      if (match) setActive(match);
    }
  });
  document.addEventListener("click", (event) => {
    if (!menu.hidden && !event.target.closest("#theme-menu, .theme-picker")) close(false);
  });
  window.addEventListener("resize", () => close(false));
  document.addEventListener("scroll", (event) => { if (!menu.contains(event.target)) place(); }, true);
  document.body.append(menu);
}

if (siteHeader) {
  const picker = document.createElement("button");
  picker.type = "button";
  picker.className = "theme-picker";
  picker.setAttribute("aria-haspopup", "listbox");
  picker.setAttribute("aria-expanded", "false");
  picker.setAttribute("aria-controls", "theme-menu");
  picker.innerHTML = '<span class="theme-picker-swatch" aria-hidden="true"></span><span class="theme-picker-text"><small>Theme</small><span class="theme-picker-name"></span></span><span class="theme-picker-chevron" aria-hidden="true">▾</span>';
  const collapse = siteHeader.querySelector(".sidebar-collapse");
  if (collapse) collapse.before(picker); else siteHeader.append(picker);
  buildThemeMenu(picker);
  setTheme(currentTheme());
}

// The sidebar opens the group holding the current page.
function openCurrentGroup() {
  if (!sidebarLayout.matches) return;
  for (const { menu, trigger } of groupMenus) {
    if (menu.classList.contains("is-current") || menu.querySelector('[aria-current="page"]')) {
      menu.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    }
  }
  if (adminMenu?.querySelector('[aria-current="page"]')) {
    adminMenu.classList.add("is-open");
    adminTrigger?.setAttribute("aria-expanded", "true");
  }
}
openCurrentGroup();

if (mobileMenuToggle && siteNavigation) {
  mobileMenuToggle.addEventListener("click", () => {
    const isExpanded = mobileMenuToggle.getAttribute("aria-expanded") === "true";
    mobileMenuToggle.setAttribute("aria-expanded", String(!isExpanded));
    mobileMenuToggle.setAttribute("aria-label", isExpanded ? "Expand navigation" : "Collapse navigation");
    document.querySelector(".site-header")?.classList.toggle("is-open", !isExpanded);
  });
  siteNavigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      mobileMenuToggle.setAttribute("aria-expanded", "false");
      mobileMenuToggle.setAttribute("aria-label", "Expand navigation");
      document.querySelector(".site-header")?.classList.remove("is-open");
      closeTeamsMenu();
      closeAdminMenu();
      closeSeasonMenu();
    }
  });
}

// Red counters for trades awaiting commissioner approval. They sit on the Admin
// trigger (visible even when the menu is closed) and on the Pending Trades link.
function refreshNavNotifications() {
  let trades = 0;
  let stream = 0;
  let fa = 0;
  let restructures = 0;
  let extensions = 0;
  try {
    const data = JSON.parse(localStorage.getItem(officeStorageKey) || "null");
    if (Array.isArray(data?.pendingTrades)) trades = data.pendingTrades.filter((trade) => trade?.status === "awaiting-admin").length;
    if (Array.isArray(data?.streamUpdates)) stream = data.streamUpdates.filter((update) => update && !update.done).length;
    if (Array.isArray(data?.faOffers)) fa = data.faOffers.filter((offer) => offer?.status === "pending").length;
    if (Array.isArray(data?.restructureRequests)) restructures = data.restructureRequests.filter((r) => r?.status === "pending").length;
    if (Array.isArray(data?.extensionOffers)) extensions = data.extensionOffers.filter((o) => o?.status === "pending").length;
  } catch {
    trades = 0;
    stream = 0;
    fa = 0;
    restructures = 0;
    extensions = 0;
  }
  const show = (key, count, label) => document.querySelectorAll(`[data-badge="${key}"]`).forEach((badge) => {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
    badge.setAttribute("aria-label", label);
    badge.title = label;
  });
  show("admin-trades", trades, `${trades} ${trades === 1 ? "trade" : "trades"} awaiting admin approval`);
  show("admin-stream", stream, `${stream} depth chart ${stream === 1 ? "update" : "updates"} for the stream`);
  show("admin-fa", fa, `${fa} free agent ${fa === 1 ? "offer" : "offers"} waiting`);
  show("admin-restructure", restructures, `${restructures} ${restructures === 1 ? "restructure" : "restructures"} waiting`);
  show("admin-extension", extensions, `${extensions} ${extensions === 1 ? "extension" : "extensions"} waiting`);
  const total = trades + stream + fa + restructures + extensions;
  show("admin-total", total, [trades ? `${trades} ${trades === 1 ? "trade" : "trades"} awaiting approval` : "", fa ? `${fa} free agent ${fa === 1 ? "offer" : "offers"}` : "", restructures ? `${restructures} ${restructures === 1 ? "restructure" : "restructures"}` : "", extensions ? `${extensions} ${extensions === 1 ? "extension" : "extensions"}` : "", stream ? `${stream} stream ${stream === 1 ? "update" : "updates"}` : ""].filter(Boolean).join(", ") || "Nothing waiting");
}

window.addEventListener("storage", (event) => {
  if (event.key === officeStorageKey || event.key === null) refreshNavNotifications();
});
refreshNavNotifications();
