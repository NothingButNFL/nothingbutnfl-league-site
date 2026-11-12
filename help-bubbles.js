// Section descriptions (p.section-subtitle) and panel descriptions (.panel-heading > p) live behind a "?" bubble next to their heading: click it to open the
// description in a small pop-out, click again, click elsewhere or press Escape to close it. The paragraph element is
// moved, not copied, so page scripts that update its text (by id) keep working.
(function helpBubbles() {
  let open = null;
  const close = () => {
    if (!open) return;
    open.pop.hidden = true;
    open.button.setAttribute("aria-expanded", "false");
    open = null;
  };
  function wire(sub, index) {
    const parent = sub.parentElement;
    // The heading just before the description: a sibling heading, or the last heading inside a sibling (panel headings
    // put the h3 in a div next to the description).
    let heading = null;
    for (const el of parent ? [...parent.children].slice(0, [...parent.children].indexOf(sub)).reverse() : []) {
      if (/^H[1-4]$/.test(el.tagName)) { heading = el; break; }
      const inner = [...el.querySelectorAll("h1, h2, h3, h4")].pop();
      if (inner) { heading = inner; break; }
    }
    if (!heading || heading.closest(".help-head")) return;
    const head = document.createElement("div");
    head.className = "help-head";
    heading.replaceWith(head);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "help-bubble";
    button.textContent = "?";
    button.setAttribute("aria-label", "About this section");
    button.setAttribute("aria-expanded", "false");
    const pop = document.createElement("div");
    pop.className = "help-pop";
    pop.id = `help-pop-${index}`;
    pop.hidden = true;
    pop.setAttribute("role", "note");
    button.setAttribute("aria-controls", pop.id);
    pop.append(sub);
    head.append(heading, button, pop);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = open?.pop === pop;
      close();
      if (wasOpen) return;
      pop.hidden = false;
      // Open just under the "?", kept inside the window.
      const headBox = head.getBoundingClientRect();
      const left = Math.min(button.offsetLeft - 14, window.innerWidth - 16 - pop.offsetWidth - headBox.left);
      pop.style.left = `${Math.max(0, left)}px`;
      button.setAttribute("aria-expanded", "true");
      open = { pop, button };
    });
    pop.addEventListener("click", (event) => event.stopPropagation());
  }
  let count = 0;
  // Section descriptions, and the descriptions in panel headings (plain paragraphs, not status lines).
  const selector = "main p.section-subtitle, main .panel-heading > p:not([class]):not(#hs-list-info)";
  function run() { document.querySelectorAll(selector).forEach((p) => wire(p, count++)); }
  // For descriptions a page adds later (e.g. the Overview's Top Players before any box scores).
  globalThis.addHelpBubble = (p) => wire(p, count++);
  document.addEventListener("click", close);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
