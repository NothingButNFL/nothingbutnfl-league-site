// News dropdown views on media.html (?view=…). Runs before media.js: sets window.mediaViewType, which media.js uses
// to lock the feed's type filter and the new-post type, and swaps the headings. "reporters" shows Manage Reporters only.
(function newsView() {
  const views = {
    "power-rankings": { type: "rankings", h1: "Power Rankings", kicker: "POWER RANKINGS", title: ["Power", "Rankings"], compose: "Create Power Rankings",
      subtitle: "Weekly power rankings from around the league. Post yours with a write-up, a graphic or a link, and tag the teams you move.", placeholder: "e.g. Week 5 Power Rankings: Jaguars stay perfect" },
    "mock-drafts": { type: "mock", h1: "Mock Drafts", kicker: "MOCK DRAFTS", title: ["Mock", "Drafts"], compose: "Create A Mock Draft",
      subtitle: "Mock drafts and big boards for the upcoming draft. Post the picks as a write-up, a graphic or a link, and tag the teams on the clock.", placeholder: "e.g. Mock Draft 2.0: QB run in the top five" },
    "independent-media": { type: "independent", h1: "Independent Media", kicker: "INDEPENDENT MEDIA", title: ["Independent", "Media"], compose: "Share Independent Media",
      subtitle: "Shows, channels, podcasts and blogs made by league members. Link the video or stream, credit the creator, and tag the teams covered.", placeholder: "e.g. The Cap Space Podcast, Ep. 12" },
    reporters: { h1: "Manage Reporters" }
  };
  const id = new URLSearchParams(location.search).get("view");
  const view = views[id];
  // Sidebar: mark the matching News item.
  const target = view ? `media.html?view=${id}` : "media.html";
  document.querySelectorAll("#news-dropdown .admin-menu-link").forEach((link) => {
    if (link.getAttribute("href") === target) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (!view) return;
  document.title = `${view.h1} | Nothing But NFL`;
  document.querySelector(".team-page-intro h1").textContent = view.h1;
  if (id === "reporters") {
    document.querySelector(".team-page-intro .team-page-subtitle").textContent = "The reporters who post on the Overview's Insider Wire.";
    document.querySelector("#news-feed").hidden = true;
    document.querySelector("#reporters").hidden = false;
    return;
  }
  window.mediaViewType = view.type;
  document.querySelector(".team-page-intro .team-page-subtitle").textContent = view.subtitle;
  document.querySelector("#media-kicker").replaceChildren(Object.assign(document.createElement("span"), { textContent: "01" }), ` ${view.kicker}`);
  const h2 = document.querySelector("#media-title");
  h2.replaceChildren(`${view.title[0]} `, Object.assign(document.createElement("span"), { textContent: view.title[1] }));
  document.querySelector("#media-subtitle").textContent = view.subtitle;
  document.querySelector("#media-compose-title").textContent = view.compose;
  document.querySelector("#media-title-input").placeholder = view.placeholder;
  document.querySelector("#media-filter-type-field").hidden = true;
})();
