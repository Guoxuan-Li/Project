// ════════════════════════════════════════════════════════════
//   cards.js -- Reusable card expansion system with two modes
//
//   Mode 1: Row expansion (vertical)
//     When a card expands, every card in the same grid row grows
//     to match the tallest expanded card's height. Collapsing
//     shrinks the whole row back. Used by bookshelf, recipes.
//
//   Mode 2: Modal overlay (global)
//     Opens a full-screen overlay with the card's full content.
//     Used by recipes (expand button) and travels (card click).
//
//   Usage:
//     var grid = CardGrid.create({
//       grid:        document.querySelector("[data-card-grid]"),
//       prefix:      "book",
//       mode:        "row",          // or "modal"
//       collapsedLines: 6,
//       buildCardHtml: function(card) { return "..."; },
//       searchableText: function(card) { return "..."; },
//       matchFields: { title: "title", body: "summary" }
//     });
//     grid.renderCards(parsedCards);
// ════════════════════════════════════════════════════════════

var CardGrid = (function () {
  "use strict";

  // ── Shared measurement helpers ───────────────────────

  function measureExpanded(wrap, innerSelector, lineHeight) {
    lineHeight = lineHeight || 1.8;
    var rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize);
    var clone = wrap.cloneNode(true);
    var cloneInner = clone.querySelector(innerSelector);
    clone.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;width:" +
      wrap.clientWidth + "px;max-height:none;overflow:visible;margin:0;";
    if (cloneInner) {
      cloneInner.style.cssText = "display:block;-webkit-line-clamp:initial;-webkit-box-orient:initial;overflow:visible;";
    }
    document.body.appendChild(clone);
    var height = clone.scrollHeight;
    document.body.removeChild(clone);
    var lineHeightPx = rootFs * lineHeight;
    return { height: height, lines: Math.max(1, Math.ceil(height / lineHeightPx)) };
  }

  function measureClampedHeight(wrap, innerSelector, lineClamp) {
    var clone = wrap.cloneNode(true);
    var cloneInner = clone.querySelector(innerSelector);
    clone.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;width:" +
      wrap.clientWidth + "px;max-height:none;overflow:visible;margin:0;";
    if (cloneInner) {
      cloneInner.style.cssText = "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:" +
        lineClamp + ";overflow:hidden;";
    }
    document.body.appendChild(clone);
    var height = clone.scrollHeight;
    document.body.removeChild(clone);
    return height;
  }

  function fittingLinesForHeight(wrap, innerSelector, height, collapsedLines) {
    if (!wrap) return collapsedLines;
    var expanded = measureExpanded(wrap, innerSelector);
    var maxLines = Math.max(collapsedLines, expanded.lines + 2);
    var best = 1;
    for (var lines = 1; lines <= maxLines; lines++) {
      var measured = measureClampedHeight(wrap, innerSelector, lines);
      if (measured - height > 1) break;
      best = lines;
    }
    return Math.max(1, best);
  }

  function animateHeight(el, from, to, duration, onComplete) {
    if (Math.abs(from - to) < 1) { if (onComplete) onComplete(); return; }
    el.style.transition = "none";
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.style.maxHeight = Math.round(from + (to - from) * eased) + "px";
      if (p < 1) requestAnimationFrame(step);
      else { el.style.transition = ""; if (onComplete) onComplete(); }
    }
    requestAnimationFrame(step);
  }

  function attachTransitionEnd(el, property, callback) {
    var done = false;
    function finish() { if (done) return; done = true; el.removeEventListener("transitionend", onEnd); callback(); }
    function onEnd(e) { if (e.target === el && e.propertyName === property) finish(); }
    el.addEventListener("transitionend", onEnd);
    setTimeout(finish, 650);
  }

  function updateTruncation(wrap, inner) {
    if (!wrap || !inner) return;
    wrap.classList.toggle("is-truncated", inner.scrollHeight - wrap.clientHeight > 1);
  }

  // ── Modal mode (global overlay) ──────────────────────

  function openModal(prefix, card, options) {
    closeModal();
    var overlay = document.createElement("div");
    overlay.className = prefix + "-modal-overlay";

    var modal = document.createElement("div");
    modal.className = prefix + "-modal";
    modal.addEventListener("click", function (e) { e.stopPropagation(); });

    var closeBtn = document.createElement("button");
    closeBtn.className = prefix + "-modal__close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closeModal);

    var titleEl = document.createElement("h2");
    titleEl.className = prefix + "-modal__title";
    titleEl.textContent = card.title;

    var bodyEl = document.createElement("div");
    bodyEl.className = prefix + "-modal__body prose";
    bodyEl.innerHTML = options.modalBodyHtml ? options.modalBodyHtml(card) : (card.bodyHtml || "");

    modal.appendChild(closeBtn);
    modal.appendChild(titleEl);
    if (options.modalSubtitle) {
      var sub = document.createElement("p");
      sub.className = prefix + "-modal__subtitle";
      sub.innerHTML = options.modalSubtitle(card);
      modal.appendChild(sub);
    }
    modal.appendChild(bodyEl);
    overlay.appendChild(modal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });

    document.body.appendChild(overlay);
    document.body.dataset[prefix + "ModalOverflow"] = document.body.style.overflow || "";
    var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) document.body.style.paddingRight = scrollbarWidth + "px";
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onEsc);
    requestAnimationFrame(function () { overlay.classList.add("is-open"); });
  }

  function closeModal() {
    var overlays = document.querySelectorAll(".modal-overlay, [class*='-modal-overlay']");
    if (!overlays.length) return;
    var overlay = overlays[overlays.length - 1];
    var prefix = overlay.className.replace(/-modal-overlay.*$/, "");
    overlay.classList.remove("is-open");
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.removeEventListener("keydown", onEsc);
    }, 280);
  }

  function onEsc(e) { if (e.key === "Escape") closeModal(); }

  // ── Factory ──────────────────────────────────────────

  function create(options) {
    var gridEl = options.grid;
    var prefix = options.prefix || "listing";
    var mode = options.mode || "row";
    var collapsedLines = options.collapsedLines || 6;
    var innerSelector = "." + prefix + "-card__body-inner";
    var wrapSelector = "." + prefix + "-card__body-wrap";
    var expandedClass = prefix + "-card--expanded";
    var peerClass = prefix + "-card--peer-expanded";
    var cardSelector = "." + prefix + "-card";

    var cards = []; // { el, ...cardData }

    function getRowPeers(card) {
      var top = card.offsetTop;
      return Array.prototype.slice.call(gridEl.querySelectorAll(cardSelector))
        .filter(function (c) {
          return c !== card && c.style.display !== "none" && Math.abs(c.offsetTop - top) <= 2;
        });
    }

    function clearExpansionState() {
      gridEl.querySelectorAll("." + expandedClass + ", ." + peerClass).forEach(function (card) {
        var body = card.querySelector("." + prefix + "-card__body");
        var wrap = card.querySelector(wrapSelector);
        var inner = card.querySelector(innerSelector);
        var isExpanded = card.classList.contains(expandedClass);
        if (inner) inner.classList.add("keep-unclamped");
        if (wrap) {
          wrap.style.maxHeight = measureClampedHeight(wrap, innerSelector, collapsedLines) + "px";
          attachTransitionEnd(wrap, "max-height", function () {
            if (inner) { inner.classList.remove("keep-unclamped"); if (!isExpanded) inner.style.removeProperty("--peer-lines"); }
            wrap.style.maxHeight = "";
            updateTruncation(wrap, inner);
          });
        }
        card.classList.remove(expandedClass, peerClass);
        if (body) body.setAttribute("aria-expanded", "false");
      });
    }

    function expandRow(article, body, wrap, inner) {
      var measured = measureExpanded(wrap, innerSelector);
      inner.classList.add("keep-unclamped");
      article.classList.add(expandedClass);
      body.setAttribute("aria-expanded", "true");

      var rowPeers = getRowPeers(article);
      var maxHeight = measured.height;
      rowPeers.forEach(function (peer) {
        if (!peer.classList.contains(expandedClass)) return;
        var pWrap = peer.querySelector(wrapSelector);
        var pInner = peer.querySelector(innerSelector);
        if (pWrap && pInner) {
          var pMeasured = measureExpanded(pWrap, innerSelector);
          if (pMeasured.height > maxHeight) maxHeight = pMeasured.height;
        }
      });
      wrap.style.maxHeight = maxHeight + "px";

      rowPeers.forEach(function (peer) {
        if (peer.classList.contains(expandedClass)) {
          var pWrap = peer.querySelector(wrapSelector);
          if (pWrap) pWrap.style.maxHeight = maxHeight + "px";
          return;
        }
        var peerBody = peer.querySelector("." + prefix + "-card__body");
        var peerWrap = peer.querySelector(wrapSelector);
        var peerInner = peer.querySelector(innerSelector);
        if (!peerWrap || !peerInner) return;
        peerInner.style.setProperty("--peer-lines", fittingLinesForHeight(peerWrap, innerSelector, maxHeight, collapsedLines));
        peerInner.classList.add("keep-unclamped");
        peer.classList.add(peerClass);
        peerBody.setAttribute("aria-expanded", "false");
        peerWrap.style.maxHeight = maxHeight + "px";
        attachTransitionEnd(peerWrap, "max-height", function () {
          peerInner.classList.remove("keep-unclamped");
          updateTruncation(peerWrap, peerInner);
        });
      });
    }

    function collapseRow(activeCard) {
      var activeWrap = activeCard.querySelector(wrapSelector);
      var activeInner = activeCard.querySelector(innerSelector);
      var activeBody = activeCard.querySelector("." + prefix + "-card__body");
      var rowPeers = getRowPeers(activeCard);
      var others = rowPeers.filter(function (p) { return p.classList.contains(expandedClass); });

      if (others.length > 0) {
        var maxHeight = 0;
        others.forEach(function (peer) {
          var pWrap = peer.querySelector(wrapSelector);
          var pInner = peer.querySelector(innerSelector);
          if (pWrap && pInner) {
            var m = measureExpanded(pWrap, innerSelector);
            if (m.height > maxHeight) maxHeight = m.height;
          }
        });
        activeInner.classList.add("keep-unclamped");
        others.forEach(function (peer) { var pw = peer.querySelector(wrapSelector); if (pw) pw.style.maxHeight = maxHeight + "px"; });
        rowPeers.forEach(function (peer) {
          if (peer === activeCard || peer.classList.contains(expandedClass)) return;
          var pw = peer.querySelector(wrapSelector);
          var pi = peer.querySelector(innerSelector);
          if (pw && pi) animatePeerToHeight(pw, pi, maxHeight);
        });
        activeCard.classList.remove(expandedClass);
        activeCard.classList.add(peerClass);
        activeInner.style.setProperty("--peer-lines", fittingLinesForHeight(activeWrap, innerSelector, maxHeight, collapsedLines));
        activeBody.setAttribute("aria-expanded", "false");
        activeWrap.style.maxHeight = maxHeight + "px";
        activeInner.classList.remove("keep-unclamped");
        updateTruncation(activeWrap, activeInner);
      } else {
        var collapsedHeight = measureClampedHeight(activeWrap, innerSelector, collapsedLines);
        activeInner.classList.add("keep-unclamped");
        activeWrap.style.maxHeight = collapsedHeight + "px";
        activeCard.classList.remove(expandedClass);
        activeBody.setAttribute("aria-expanded", "false");
        rowPeers.forEach(function (peer) {
          var pw = peer.querySelector(wrapSelector);
          var pi = peer.querySelector(innerSelector);
          if (pi) pi.classList.add("keep-unclamped");
          if (pw) {
            pw.style.maxHeight = measureClampedHeight(pw, innerSelector, collapsedLines) + "px";
            attachTransitionEnd(pw, "max-height", function () {
              if (pi) { pi.classList.remove("keep-unclamped"); pi.style.removeProperty("--peer-lines"); }
              pw.style.maxHeight = "";
              updateTruncation(pw, pi);
            });
          }
          peer.classList.remove(peerClass);
        });
        attachTransitionEnd(activeWrap, "max-height", function () {
          activeInner.classList.remove("keep-unclamped");
          activeWrap.style.maxHeight = "";
          updateTruncation(activeWrap, activeInner);
        });
      }
    }

    function animatePeerToHeight(wrap, inner, height) {
      inner.classList.add("keep-unclamped");
      var current = parseFloat(wrap.style.maxHeight) || wrap.clientHeight || wrap.scrollHeight;
      if (Math.abs(current - height) > 1) {
        animateHeight(wrap, current, height, 400, function () {
          inner.style.setProperty("--peer-lines", fittingLinesForHeight(wrap, innerSelector, height, collapsedLines));
          inner.classList.remove("keep-unclamped");
          wrap.style.maxHeight = height + "px";
          updateTruncation(wrap, inner);
        });
        return;
      }
      wrap.style.maxHeight = height + "px";
      inner.style.setProperty("--peer-lines", fittingLinesForHeight(wrap, innerSelector, height, collapsedLines));
      inner.classList.remove("keep-unclamped");
      updateTruncation(wrap, inner);
    }

    function renderCard(card, index) {
      var article = document.createElement("article");
      article.className = prefix + "-card";
      article.dataset.index = String(index);

      var html = options.buildCardHtml(card, prefix);
      article.innerHTML = html;

      var body = article.querySelector("." + prefix + "-card__body");
      var wrap = article.querySelector(wrapSelector);
      var inner = article.querySelector(innerSelector);

      if (body) {
        article.setAttribute("role", "button");
        article.setAttribute("tabindex", "0");
        body.setAttribute("aria-expanded", "false");
      }

      // Wire up expansion behavior
      if (mode === "row" && body && wrap && inner) {
        function toggle() {
          if (article.classList.contains(expandedClass)) collapseRow(article);
          else if (article.classList.contains(peerClass)) {
            // Promote peer to expanded
            article.classList.remove(peerClass);
            article.classList.add(expandedClass);
            body.setAttribute("aria-expanded", "true");
            var measured = measureExpanded(wrap, innerSelector);
            var rowPeers = getRowPeers(article);
            var maxHeight = measured.height;
            [article].concat(rowPeers).forEach(function (c) {
              if (!c.classList.contains(expandedClass)) return;
              var cW = c.querySelector(wrapSelector);
              var cI = c.querySelector(innerSelector);
              if (cW && cI) { var m = measureExpanded(cW, innerSelector); if (m.height > maxHeight) maxHeight = m.height; }
            });
            wrap.style.maxHeight = maxHeight + "px";
          } else {
            expandRow(article, body, wrap, inner);
          }
        }
        article.addEventListener("click", function (e) {
          if (window.getSelection().toString().length > 0) return;
          if (e.target.closest("a, button, input, ." + prefix + "-card__match")) return;
          toggle();
        });
        article.addEventListener("keydown", function (e) {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault(); toggle();
        });
        // Sync initial height
        if (wrap) {
          wrap.style.maxHeight = measureClampedHeight(wrap, innerSelector, collapsedLines) + "px";
          updateTruncation(wrap, inner);
        }
      }

      // Modal mode: wire up expand button
      if (mode === "modal" || options.allowModal) {
        var modalBtn = article.querySelector("[data-card-modal]");
        if (modalBtn) {
          modalBtn.addEventListener("click", function (e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            openModal(prefix, card, options);
          });
        }
      }

      return article;
    }

    function renderCards(parsedCards) {
      gridEl.innerHTML = "";
      cards = [];
      parsedCards.forEach(function (card, i) {
        var el = renderCard(card, i);
        gridEl.appendChild(el);
        cards.push(Object.assign({ el: el }, card));
      });
      return cards;
    }

    function getCards() { return cards; }

    function showEmpty(message) {
      var existing = gridEl.querySelector("." + prefix + "-empty");
      if (existing) existing.remove();
      if (message) {
        var el = document.createElement("div");
        el.className = prefix + "-empty empty-state";
        el.innerHTML = '<div class="empty-state__icon">&#8709;</div><p>' + message + "</p>";
        gridEl.appendChild(el);
      }
    }

    return {
      renderCards: renderCards,
      getCards: getCards,
      clearExpansionState: clearExpansionState,
      showEmpty: showEmpty,
      openModal: function (card) { openModal(prefix, card, options); },
      closeModal: closeModal,
      getRowPeers: getRowPeers,
      measureExpanded: function (w, i) { return measureExpanded(w, i || innerSelector); },
      measureClampedHeight: function (w, i, n) { return measureClampedHeight(w, i || innerSelector, n || collapsedLines); }
    };
  }

  return { create: create };
})();

if (typeof window !== "undefined") window.CardGrid = CardGrid;