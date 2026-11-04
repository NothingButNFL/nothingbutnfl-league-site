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

// Light / dark mode toggle (sidebar and mobile menu). The choice is remembered in this browser.
const themeKey = "nbf-theme";
function currentTheme() { return document.documentElement.dataset.theme === "light" ? "light" : "dark"; }
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(themeKey, theme); } catch { /* storage unavailable */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#ffffff" : "#071a33");
  for (const button of document.querySelectorAll(".theme-toggle")) {
    const next = theme === "light" ? "dark" : "light";
    button.querySelector(".theme-toggle-icon").innerHTML = theme === "light"
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
    button.querySelector(".theme-toggle-label").textContent = next === "light" ? "Light mode" : "Dark mode";
    button.setAttribute("aria-label", `Switch to ${next} mode`);
    button.title = `Switch to ${next} mode`;
  }
}
if (siteHeader) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "theme-toggle";
  toggle.innerHTML = '<span class="theme-toggle-icon" aria-hidden="true"></span><span class="theme-toggle-label"></span>';
  toggle.addEventListener("click", () => setTheme(currentTheme() === "light" ? "dark" : "light"));
  const collapse = siteHeader.querySelector(".sidebar-collapse");
  if (collapse) collapse.before(toggle); else siteHeader.append(toggle);
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
  try {
    const data = JSON.parse(localStorage.getItem(officeStorageKey) || "null");
    if (Array.isArray(data?.pendingTrades)) trades = data.pendingTrades.filter((trade) => trade?.status === "awaiting-admin").length;
    if (Array.isArray(data?.streamUpdates)) stream = data.streamUpdates.filter((update) => update && !update.done).length;
    if (Array.isArray(data?.faOffers)) fa = data.faOffers.filter((offer) => offer?.status === "pending").length;
  } catch {
    trades = 0;
    stream = 0;
    fa = 0;
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
  const total = trades + stream + fa;
  show("admin-total", total, [trades ? `${trades} ${trades === 1 ? "trade" : "trades"} awaiting approval` : "", fa ? `${fa} free agent ${fa === 1 ? "offer" : "offers"}` : "", stream ? `${stream} stream ${stream === 1 ? "update" : "updates"}` : ""].filter(Boolean).join(", ") || "Nothing waiting");
}

window.addEventListener("storage", (event) => {
  if (event.key === officeStorageKey || event.key === null) refreshNavNotifications();
});
refreshNavNotifications();
