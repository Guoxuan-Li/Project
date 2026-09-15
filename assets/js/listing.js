// ════════════════════════════════════════════════════════════
//   listing.js -- Page controller for listing pages
//
//   Combines SearchEngine + CardGrid with a notebook HTML parser.
//   Reads its configuration from data-* attributes on the page:
//
//     [data-search-toolbar]  -- the search bar (search.js)
//     [data-card-grid]       -- the card grid (cards.js)
//       data-mode            -- "row" or "modal"
//       data-prefix          -- CSS class prefix
//       data-collapsed-lines -- lines when collapsed
//     [data-card-source]     -- <template> with rendered notebook HTML
//
//   The notebook is parsed by splitting on H1 (each H1 = one card).
//   For richer parsing (H1=category, H2=item), see travels.js.
// ════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var toolbar = document.querySelector("[data-search-toolbar]");
  var gridEl = document.querySelector("[data-card-grid]");
  var sourceEl = document.querySelector("[data-card-source]");

  if (!toolbar || !gridEl || !sourceEl) return;

  var prefix = gridEl.dataset.prefix || "listing";
  var mode = gridEl.dataset.mode || "row";
  var collapsedLines = parseInt(gridEl.dataset.collapsedLines, 10) || 6;
  var accent = toolbar.dataset.accent || "sakura";
  var scopeFields = Array.prototype.slice.call(
    toolbar.querySelectorAll("[data-scope-field]")
  ).map(function (input) { return input.value; });

  // ── Parse the notebook HTML into card objects ────────
  // Each H1 starts a new card. Content between H1s becomes
  // the card body. The first paragraph after "Summary:" or
  // similar marker becomes the card summary.

  function parseCards(html) {
    var container = document.createElement("div");
    container.innerHTML = html;
    var cards = [];
    var current = null;

    Array.prototype.forEach.call(container.childNodes, function (node) {
      if (node.nodeType === 1 && node.tagName === "H1") {
        if (current) cards.push(current);
        current = {
          title: node.textContent.trim(),
          meta: "",
          bodyNodes: [],
          bodyHtml: "",
          bodyText: ""
        };
        return;
      }
      if (!current || node.nodeType !== 1) return;

      // Capture meta from specific patterns
      var text = (node.textContent || "").trim();
      if (!text) return;

      // Lines starting with known prefixes become metadata
      var metaMatch = text.match(/^(?:author|source|from|by|date|status|rating|time|difficulty|servings|place|country|city)[:：]\s*(.+)/i);
      if (metaMatch && !current.bodyHtml) {
        current.meta += (current.meta ? " . " : "") + text;
        return;
      }

      current.bodyNodes.push(node);
    });
    if (current) cards.push(current);

    // Finalize body HTML and text for each card
    cards.forEach(function (card) {
      var d = document.createElement("div");
      card.bodyNodes.forEach(function (n) { d.appendChild(n.cloneNode(true)); });
      card.bodyHtml = d.innerHTML;
      card.bodyText = (d.textContent || "").replace(/\s+/g, " ").trim();
    });

    return cards;
  }

  // ── Build card HTML ──────────────────────────────────

  function buildCardHtml(card, pfx) {
    var html = "";
    html += '<div class="' + pfx + '-card__body" role="button" tabindex="0">';
    html += '  <div class="' + pfx + '-card__heading">';
    html += '    <h3 class="' + pfx + '-card__title">' + escapeHtml(card.title) + "</h3>";
    if (card.meta) {
      html += '    <div class="' + pfx + '-card__meta">' + escapeHtml(card.meta) + "</div>";
    }
    html += "  </div>";
    html += '  <div class="' + pfx + '-card__body-wrap">';
    html += '    <div class="' + pfx + '-card__body-inner prose">' + card.bodyHtml + "</div>";
    html += "  </div>";

    if (mode === "modal") {
      html += '  <button class="' + pfx + '-card__expand-btn" data-card-modal type="button" aria-label="Expand">';
      html += '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
      html += '      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>';
      html += '      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>';
      html += "    </svg>";
      html += "  </button>";
    }

    html += '  <div class="' + pfx + '-card__match" hidden></div>';
    html += "</div>";
    return html;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Wire up search + cards ───────────────────────────

  var cardGrid = CardGrid.create({
    grid: gridEl,
    prefix: prefix,
    mode: mode,
    collapsedLines: collapsedLines,
    buildCardHtml: buildCardHtml,
    modalBodyHtml: function (card) { return card.bodyHtml; }
  });

  var searchEngine = SearchEngine.create({
    toolbar: toolbar,
    prefix: prefix,
    scopes: scopeFields,
    onFilter: applyFilter
  });

  function applyFilter() {
    var terms = searchEngine.activeTerms();
    var shown = 0;
    var allCards = cardGrid.getCards();

    cardGrid.clearExpansionState();

    allCards.forEach(function (card) {
      // Build searchable text from title + meta + body
      var text = (card.title + " " + (card.meta || "") + " " + card.bodyText).toLowerCase();
      var match = searchEngine.matchesSearch(text);

      card.el.style.display = match ? "" : "none";
      var matchEl = card.el.querySelector("." + prefix + "-card__match");

      if (match) {
        shown++;
        if (terms.length && matchEl) {
          var preview = searchEngine.buildMatchPreview("Title", card.title, terms) ||
            searchEngine.buildMatchPreview("Body", card.bodyText, terms);
          if (preview) {
            matchEl.innerHTML = '<span class="' + prefix + '-card__match-label">' + preview.label +
              '</span><span class="' + prefix + '-card__match-text">' + preview.html + "</span>";
            matchEl.hidden = false;
          } else { matchEl.hidden = true; }
        } else if (matchEl) { matchEl.hidden = true; }
      } else if (matchEl) { matchEl.hidden = true; }
    });

    searchEngine.setCount(allCards.length, shown);
    if (shown === 0 && allCards.length > 0) {
      cardGrid.showEmpty("No matches. Try a different keyword.");
    } else {
      cardGrid.showEmpty(null);
    }
  }

  // ── Init ─────────────────────────────────────────────

  function init() {
    var parsed = parseCards(sourceEl.innerHTML);
    cardGrid.renderCards(parsed);
    searchEngine.init();
    applyFilter();
    searchEngine.hideLoading();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();