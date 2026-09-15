// ════════════════════════════════════════════════════════════
//   bookshelf.js —— 书架页面
//   H1 = 书名；“简介：”之后直到下一个 H1 前都属于简介。
// ════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var BOOK_COLLAPSED_LINES = 6;
  var SOURCE_EL = document.getElementById("book-source");
  var GRID_EL = document.getElementById("book-grid");
  var INPUT_EL = document.getElementById("book-search-input");
  var CHIPS_EL = document.getElementById("book-chips");
  var SEARCH_EL = INPUT_EL ? INPUT_EL.closest(".book-search") : null;
  var COUNT_TOTAL = document.getElementById("book-count-total");
  var COUNT_SHOWN = document.getElementById("book-count-shown");
  var SCOPE_EL = document.getElementById("book-search-scope");
  var SCOPE_LABEL = document.getElementById("book-search-scope-label");
  var SEARCH_PLACEHOLDER = INPUT_EL ? INPUT_EL.getAttribute("placeholder") : "";

  var books = [];
  var chips = [];
  var chipOps = [];
  var insertionIndex = 0;
  var removingChip = false;
  var searchScopes = { title: true, author: true, country: true, summary: true };
  // state checked via classList

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function activeTerms() {
    var rawTerms = (INPUT_EL.value || "").trim().split(/\s+/).filter(Boolean);
    return chips.concat(rawTerms).map(function (t) { return t.toLowerCase(); }).filter(Boolean);
  }

  function expressionParts() {
    var rawTerms = (INPUT_EL.value || "").trim().split(/\s+/).filter(Boolean)
      .map(function (t) { return t.toLowerCase(); });
    var terms = chips.map(function (t) { return t.toLowerCase(); }).filter(Boolean);
    var ops = chipOps.slice();
    if (rawTerms.length) {
      var position = Math.max(0, Math.min(insertionIndex, terms.length));
      var insertedOps = [];
      for (var r = 1; r < rawTerms.length; r++) insertedOps.push("and");
      terms.splice.apply(terms, [position, 0].concat(rawTerms));
      if (!chips.length) {
        ops = insertedOps;
      } else if (position === 0) {
        ops = insertedOps.concat(["and"], ops);
      } else if (position >= chips.length) {
        ops = ops.concat(["and"], insertedOps);
      } else {
        ops = ops.slice(0, position - 1)
          .concat(["and"], insertedOps, [ops[position - 1] || "and"], ops.slice(position));
      }
    }
    return { terms: terms, ops: ops };
  }

  function matchesSearch(text) {
    var parts = expressionParts();
    if (!parts.terms.length) return true;
    var groups = [[]];
    parts.terms.forEach(function (term, idx) {
      if (idx > 0 && (parts.ops[idx - 1] || "and") === "or") groups.push([]);
      groups[groups.length - 1].push(term);
    });
    return groups.some(function (group) {
      return group.every(function (term) { return text.indexOf(term) !== -1; });
    });
  }

  function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function highlightTerms(escaped, terms) {
    var valid = terms.filter(Boolean).sort(function (a, b) { return b.length - a.length; });
    if (!valid.length) return escaped;
    return escaped.replace(new RegExp("(" + valid.map(escapeReg).join("|") + ")", "gi"), '<mark class="search-hit">$1</mark>');
  }

  function buildMatchPreview(label, text, terms) {
    var lowerText = text.toLowerCase();
    var bestIdx = -1, bestTerm = "";
    terms.forEach(function (term) {
      var idx = lowerText.indexOf(term);
      if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
        bestIdx = idx;
        bestTerm = term;
      }
    });
    if (bestIdx < 0) return null;
    var radius = 42;
    var start = Math.max(0, bestIdx - radius);
    var end = Math.min(text.length, bestIdx + bestTerm.length + radius);
    var snippet = (start > 0 ? "... " : "") + text.slice(start, end) + (end < text.length ? " ..." : "");
    return '<span class="book-card__match-label">' + label + '</span>' +
      '<span class="book-card__match-text">' + highlightTerms(escapeHtml(snippet), terms) + '</span>';
  }

  function cleanTitle(text) {
    return text.trim().replace(/^《/, "").replace(/》$/, "");
  }

  function parseAuthor(text) {
    var value = text.replace(/^作者[:：]\s*/, "").trim();
    var country = "";
    var countryMatch = value.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (countryMatch) {
      country = countryMatch[1].trim();
      value = countryMatch[2].trim();
    }
    return { author: value || "未知作者", country: country || "未知" };
  }

  function appendSummary(book, text) {
    if (!text) return;
    book.summaryParts.push(text);
    book.summary = book.summaryParts.join("\n\n");
  }

  function applyBookText(book, text) {
    var lines = text.split(/\n+/).map(function (line) { return line.trim(); }).filter(Boolean);
    lines.forEach(function (line) {
      if (/^作者[:：]/.test(line) && !book.readingSummary) {
        var parsed = parseAuthor(line);
        book.author = parsed.author;
        book.country = parsed.country;
      } else if (/^简介[:：]/.test(line)) {
        book.readingSummary = true;
        appendSummary(book, line.replace(/^简介[:：]\s*/, "").trim());
      } else if (book.readingSummary) {
        appendSummary(book, line);
      } else {
        appendSummary(book, line);
      }
    });
  }

  function parseCards() {
    var container = document.createElement("div");
    container.innerHTML = SOURCE_EL.innerHTML;
    var cards = [];
    var current = null;

    Array.prototype.forEach.call(container.childNodes, function (node) {
      if (node.nodeType === 1 && node.tagName === "H1") {
        if (current) cards.push(current);
       current = {
         title: cleanTitle(node.textContent),
         author: "未知作者",
         country: "未知",
         summary: "",
        summaryParts: [],
         reviews: [],
         readingSummary: false,
         summaryQuotes: [],
         reviewMode: false
       };
       return;
     }
     if (!current || node.nodeType !== 1) return;
     if (node.tagName === "BLOCKQUOTE") {
      var quoteText = (node.textContent || "").trim();
      if (quoteText) {
        quoteText.split(/\n+/).forEach(function (line) {
          line = line.trim();
          if (!line) return;
          if (current.reviewMode) {
            current.reviews.push({ type: "quote", content: line });
          } else {
            current.summaryQuotes.push(line);
          }
       });
      }
      return;
    }
    if (node.tagName === "UL") {
       current.reviewMode = true;
       Array.prototype.forEach.call(node.querySelectorAll("li"), function (li) {
         var reviewText = (li.textContent || "").trim();
         if (reviewText) current.reviews.push({ type: "text", content: reviewText });
       });
       return;
     }
     var text = (node.textContent || "").trim();
     if (!text) return;
     applyBookText(current, text);
    });

    if (current) cards.push(current);
    return cards;
  }

  function renderCards(cards) {
    GRID_EL.innerHTML = "";
    books = [];

    cards.forEach(function (book, i) {
      var article = document.createElement("article");
      article.className = "book-card";
      article.dataset.index = String(i);

      var body = document.createElement("div");
      body.className = "book-card__body";
      article.setAttribute("role", "button");
      article.setAttribute("tabindex", "0");
      body.setAttribute("aria-expanded", "false");

      var meta = document.createElement("div");
      meta.className = "book-card__meta";
      meta.innerHTML = "<span>[" + escapeHtml(book.country) + "]</span><span>" +
        escapeHtml(book.author) + "</span>";

      var title = document.createElement("h3");
      title.className = "book-card__title";
      title.textContent = book.title;
      title.title = book.title;

      var heading = document.createElement("div");
      heading.className = "book-card__heading";
      heading.appendChild(title);
      heading.appendChild(meta);

      var summary = document.createElement("p");
      summary.className = "book-card__summary";
      summary.textContent = book.summary || "暂无简介。";

     var summaryWrap = document.createElement("div");
     summaryWrap.className = "book-card__summary-wrap";
    summaryWrap.appendChild(summary);

     if (book.summaryQuotes && book.summaryQuotes.length) {
       book.summaryQuotes.forEach(function (quote) {
         var bq = document.createElement("blockquote");
         bq.className = "book-card__summary-quote";
         bq.textContent = quote;
         summaryWrap.appendChild(bq);
       });
     }

     var reviewsWrap = null;
     if (book.reviews && book.reviews.length) {
       reviewsWrap = document.createElement("div");
       reviewsWrap.className = "book-card__reviews";

      var reviewsInner = document.createElement("div");
       reviewsInner.className = "book-card__reviews-inner";

       var reviewsText = document.createElement("div");
       reviewsText.className = "book-card__reviews-text";
      book.reviews.forEach(function (review) {
         if (review.type === "quote") {
           var bq = document.createElement("blockquote");
           bq.textContent = review.content;
           reviewsText.appendChild(bq);
         } else {
           var p = document.createElement("p");
           p.textContent = review.content;
           reviewsText.appendChild(p);
         }
       });
       reviewsInner.appendChild(reviewsText);

       var spoiler = document.createElement("button");
       spoiler.type = "button";
       spoiler.className = "book-card__spoiler";
     spoiler.setAttribute("aria-label", "显示书评");
      spoiler.innerHTML = '<span>可能涉及剧透</span>';
      reviewsInner.appendChild(spoiler);

       reviewsWrap.appendChild(reviewsInner);
       summaryWrap.appendChild(reviewsWrap);

      spoiler.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!article.classList.contains("book-card--expanded")) {
          promotePeer(article);
          return;
        }
        reviewsWrap.classList.toggle("is-revealed");
         spoiler.setAttribute("aria-label",
           reviewsWrap.classList.contains("is-revealed") ? "隐藏书评" : "显示书评");
       });
     }

     body.appendChild(heading);
      var matchEl = document.createElement("div");
      matchEl.className = "book-card__match";
      matchEl.setAttribute("hidden", "");

      body.appendChild(summaryWrap);
      body.appendChild(matchEl);
      article.appendChild(body);
      GRID_EL.appendChild(article);
      updateTruncationState(summaryWrap, summary);

     function expand() {
       summary.classList.add("keep-unclamped");
       article.classList.add("book-card--expanded");
       body.setAttribute("aria-expanded", "true");
       // Find the tallest expanded card in this row
       var rowPeers = getRowPeers(article);
        var maxHeight = summaryWrap.scrollHeight;
       rowPeers.forEach(function (peer) {
         if (!peer.classList.contains("book-card--expanded")) return;
         var pWrap = peer.querySelector(".book-card__summary-wrap");
          if (pWrap) {
            var pH = pWrap.scrollHeight;
            if (pH > maxHeight) maxHeight = pH;
          }
       });
        summaryWrap.style.maxHeight = maxHeight + "px";

        rowPeers.forEach(function (peer) {
          if (peer.classList.contains("book-card--expanded")) {
            var pWrap = peer.querySelector(".book-card__summary-wrap");
            if (pWrap) pWrap.style.maxHeight = maxHeight + "px";
            return;
          }
          var peerBody = peer.querySelector(".book-card__body");
          var peerWrap = peer.querySelector(".book-card__summary-wrap");
          var peerSummary = peer.querySelector(".book-card__summary");
          if (!peerWrap || !peerSummary) return;
          setPeerLinesForHeight(peerWrap, peerSummary, maxHeight);
          peerSummary.classList.add("keep-unclamped");
          peer.classList.add("book-card--peer-expanded");
          if (peerBody) peerBody.setAttribute("aria-expanded", "false");
          peerWrap.style.maxHeight = maxHeight + "px";
          attachTransitionEnd(peerWrap, "max-height", function () {
            peerSummary.classList.remove("keep-unclamped");
            updateTruncationState(peerWrap, peerSummary);
          });
        });
      }

      function toggle() {
        if (article.classList.contains("book-card--expanded")) {
          collapseCard(article);
        } else if (article.classList.contains("book-card--peer-expanded")) {
          promotePeer(article);
        } else {
          expand();
        }
      }

     article.addEventListener("click", function (e) {
       if (window.getSelection().toString().length > 0) return;
       if (e.target.closest("a, button, input, .book-card__match")) return;
       var revealedReviews = e.target.closest(".book-card__reviews.is-revealed");
       if (revealedReviews) {
         revealedReviews.classList.remove("is-revealed");
         var sp = revealedReviews.querySelector(".book-card__spoiler");
         if (sp) sp.setAttribute("aria-label", "显示书评");
         return;
       }
       toggle();
     });
      article.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggle();
      });

      books.push({
        el: article,
        title: book.title,
        author: book.author,
        country: book.country,
        summary: book.summary
      });
    });
  }

  function measureExpanded(wrap, inner) {
    var rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize);
   var clone = wrap.cloneNode(true);
   var cloneInner = clone.querySelector(".book-card__summary");
  var cloneReviews = clone.querySelector(".book-card__reviews");
   if (cloneReviews) cloneReviews.style.display = "block";
   var cloneQuotes = clone.querySelectorAll(".book-card__summary-quote");
   Array.prototype.forEach.call(cloneQuotes, function (q) { q.style.display = "block"; });
   clone.style.cssText =
     "position:absolute;visibility:hidden;left:-9999px;top:0;" +
     "width:" + wrap.clientWidth + "px;" +
     "max-height:none;overflow:visible;margin:0;";
   if (cloneInner) {
     cloneInner.style.cssText =
       "display:block;-webkit-line-clamp:initial;-webkit-box-orient:initial;overflow:visible;";
   }
    document.body.appendChild(clone);
    var height = clone.scrollHeight;
    document.body.removeChild(clone);
    var lineHeightPx = rootFs * 1.8;
    return {
      height: height,
      lines: Math.max(1, Math.ceil(height / lineHeightPx))
    };
  }

  function measureClampedHeight(wrap, inner, lineClamp) {
    var clone = wrap.cloneNode(true);
    var cloneInner = clone.querySelector(".book-card__summary");
    clone.style.cssText =
      "position:absolute;visibility:hidden;left:-9999px;top:0;" +
      "width:" + wrap.clientWidth + "px;" +
      "max-height:none;overflow:visible;margin:0;";
    if (cloneInner) {
      cloneInner.style.cssText =
        "display:-webkit-box;-webkit-box-orient:vertical;" +
        "-webkit-line-clamp:" + lineClamp + ";overflow:hidden;";
    }
    document.body.appendChild(clone);
    var height = clone.scrollHeight;
    document.body.removeChild(clone);
    return height;
  }

  function fittingLinesForHeight(wrap, inner, height) {
    if (!wrap || !inner) return BOOK_COLLAPSED_LINES;
    var expanded = measureExpanded(wrap, inner);
    var maxLines = Math.max(BOOK_COLLAPSED_LINES, expanded.lines + 2);
    var best = 1;
    for (var lines = 1; lines <= maxLines; lines++) {
      var measuredHeight = measureClampedHeight(wrap, inner, lines);
      if (measuredHeight - height > 1) break;
      best = lines;
    }
    return Math.max(1, best);
  }

  function setPeerLinesForHeight(wrap, inner, height) {
    if (!inner) return;
    inner.style.setProperty("--peer-lines", fittingLinesForHeight(wrap, inner, height));
  }

  function animatePeerToHeight(wrap, inner, height) {
    if (!wrap || !inner) return;
    inner.classList.add("keep-unclamped");
    var currentHeight = parseFloat(wrap.style.maxHeight) || wrap.clientHeight || wrap.scrollHeight;
    if (Math.abs(currentHeight - height) > 1) {
      animateHeight(wrap, currentHeight, height, 400, function () {
        setPeerLinesForHeight(wrap, inner, height);
        inner.classList.remove("keep-unclamped");
        wrap.style.maxHeight = height + "px";
        updateTruncationState(wrap, inner);
      });
      return;
    }
    wrap.style.maxHeight = height + "px";
    setPeerLinesForHeight(wrap, inner, height);
    inner.classList.remove("keep-unclamped");
    updateTruncationState(wrap, inner);
  }

  function updateTruncationState(wrap, inner) {
    if (!wrap || !inner) return;
    wrap.classList.toggle("is-truncated", inner.scrollHeight - wrap.clientHeight > 1);
  }

  function animateHeight(el, from, to, duration, onComplete) {
    if (Math.abs(from - to) < 1) { if (onComplete) onComplete(); return; }
    el.style.transition = "none";
    var startTime = null;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var p = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.style.maxHeight = Math.round(from + (to - from) * eased) + "px";
      if (p < 1) requestAnimationFrame(step);
      else if (onComplete) {
        el.style.transition = "";
        onComplete();
      }
    }
    requestAnimationFrame(step);
  }

  function attachTransitionEnd(el, property, callback) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      el.removeEventListener("transitionend", onEnd);
      callback();
    }
    function onEnd(e) {
      if (e.target === el && e.propertyName === property) finish();
    }
    el.addEventListener("transitionend", onEnd);
    setTimeout(finish, 600);
  }

  function clearExpansionState() {
    var allCards = document.querySelectorAll(".book-card--expanded, .book-card--peer-expanded");
   allCards.forEach(function (card) {
     resetReviewMask(card);
     var body = card.querySelector(".book-card__body");
     var wrap = card.querySelector(".book-card__summary-wrap");
      var summary = card.querySelector(".book-card__summary");
      var isExpanded = card.classList.contains("book-card--expanded");
      if (summary) summary.classList.add("keep-unclamped");
      if (wrap) {
        wrap.style.maxHeight = measureClampedHeight(wrap, summary, BOOK_COLLAPSED_LINES) + "px";
        attachTransitionEnd(wrap, "max-height", function () {
          if (isExpanded) {
            card.classList.remove("book-card--expanded");
            if (body) body.setAttribute("aria-expanded", "false");
          } else {
            card.classList.remove("book-card--peer-expanded");
          }
          if (summary) {
            summary.classList.remove("keep-unclamped");
            if (!isExpanded) summary.style.removeProperty("--peer-lines");
          }
          wrap.style.maxHeight = "";
          updateTruncationState(wrap, summary);
        });
      } else {
        if (isExpanded) {
          card.classList.remove("book-card--expanded");
          if (body) body.setAttribute("aria-expanded", "false");
        } else {
          card.classList.remove("book-card--peer-expanded");
        }
      }
    });
  }
  
  function getRowPeers(card) {
    var top = card.offsetTop;
    return Array.prototype.slice
      .call(GRID_EL.querySelectorAll(".book-card"))
      .filter(function (c) {
        return c !== card && c.style.display !== "none" && Math.abs(c.offsetTop - top) <= 2;
      });
  }

  function promotePeer(peerCard) {
    var peerBody = peerCard.querySelector(".book-card__body");
    var peerWrap = peerCard.querySelector(".book-card__summary-wrap");
    var peerSummary = peerCard.querySelector(".book-card__summary");

    peerCard.classList.remove("book-card--peer-expanded");
    peerCard.classList.add("book-card--expanded");
    if (peerBody) peerBody.setAttribute("aria-expanded", "true");

    var rowPeers = getRowPeers(peerCard);
    var maxHeight = peerWrap.scrollHeight;
    [peerCard].concat(rowPeers).forEach(function (c) {
      if (!c.classList.contains("book-card--expanded")) return;
      var cWrap = c.querySelector(".book-card__summary-wrap");
      if (cWrap) {
        var cH = cWrap.scrollHeight;
        if (cH > maxHeight) maxHeight = cH;
      }
    });

    [peerCard].concat(rowPeers).forEach(function (c) {
     var cWrap = c.querySelector(".book-card__summary-wrap");
      if (c.classList.contains("book-card--peer-expanded")) {
        var cSummary = c.querySelector(".book-card__summary");
        var cWrap = c.querySelector(".book-card__summary-wrap");
        if (cSummary && cWrap) {
          var curH = parseFloat(cWrap.style.maxHeight) || cWrap.scrollHeight;
          setPeerLinesForHeight(cWrap, cSummary, maxHeight);
          animateHeight(cWrap, curH, maxHeight, 400, function () {
            updateTruncationState(cWrap, cSummary);
          });
        }
      } else {
        var cWrap = c.querySelector(".book-card__summary-wrap");
        if (cWrap) cWrap.style.maxHeight = maxHeight + "px";
      }
    });
  }

 function resetReviewMask(card) {
   var reviews = card.querySelector(".book-card__reviews.is-revealed");
   if (reviews) {
     reviews.classList.remove("is-revealed");
     var spoiler = reviews.querySelector(".book-card__spoiler");
     if (spoiler) spoiler.setAttribute("aria-label", "显示书评");
   }
 }

 function collapseCard(activeCard) {
   resetReviewMask(activeCard);
   var activeWrap = activeCard.querySelector(".book-card__summary-wrap");
    var activeSummary = activeCard.querySelector(".book-card__summary");
    var activeBody = activeCard.querySelector(".book-card__body");
    var rowPeers = getRowPeers(activeCard);

    var othersExpanded = rowPeers.filter(function (p) {
      return p.classList.contains("book-card--expanded");
    });

    if (othersExpanded.length > 0) {
      // Collapse this card, row at tallest remaining
      var maxHeight = 0;
      othersExpanded.forEach(function (peer) {
        var pWrap = peer.querySelector(".book-card__summary-wrap");
        if (pWrap) {
          var pH = pWrap.scrollHeight;
          if (pH > maxHeight) maxHeight = pH;
        }
      });

     activeSummary.classList.add("keep-unclamped");

      othersExpanded.forEach(function (peer) {
        var pWrap = peer.querySelector(".book-card__summary-wrap");
        if (pWrap) pWrap.style.maxHeight = maxHeight + "px";
      });
      rowPeers.forEach(function (peer) {
        if (peer === activeCard || peer.classList.contains("book-card--expanded")) return;
        var pWrap = peer.querySelector(".book-card__summary-wrap");
        var pSummary = peer.querySelector(".book-card__summary");
        animatePeerToHeight(pWrap, pSummary, maxHeight);
      });

     // Row height unchanged - apply immediately without animation
      var currentHeight = parseFloat(activeWrap.style.maxHeight);
      if (currentHeight && Math.abs(currentHeight - maxHeight) > 1) {
        // Row height changes - animate smoothly
        animateHeight(activeWrap, currentHeight, maxHeight, 400, function () {
          activeCard.classList.remove("book-card--expanded");
          activeCard.classList.add("book-card--peer-expanded");
          setPeerLinesForHeight(activeWrap, activeSummary, maxHeight);
          if (activeBody) activeBody.setAttribute("aria-expanded", "false");
          activeSummary.classList.remove("keep-unclamped");
          activeWrap.style.maxHeight = maxHeight + "px";
          updateTruncationState(activeWrap, activeSummary);
        });
      } else {
        // Row height unchanged - apply immediately
        activeCard.classList.remove("book-card--expanded");
        activeCard.classList.add("book-card--peer-expanded");
        setPeerLinesForHeight(activeWrap, activeSummary, maxHeight);
        if (activeBody) activeBody.setAttribute("aria-expanded", "false");
        activeSummary.classList.remove("keep-unclamped");
        activeWrap.style.maxHeight = maxHeight + "px";
        updateTruncationState(activeWrap, activeSummary);
      }
    } else {
      // No other expanded cards -> collapse entire row
      var collapsedHeight = measureClampedHeight(activeWrap, activeSummary, BOOK_COLLAPSED_LINES);
      activeSummary.classList.add("keep-unclamped");
      activeWrap.style.maxHeight = collapsedHeight + "px";

      rowPeers.forEach(function (peer) {
        var peerWrap = peer.querySelector(".book-card__summary-wrap");
        var peerSummary = peer.querySelector(".book-card__summary");
        if (peerSummary) peerSummary.classList.add("keep-unclamped");
        if (peerWrap) {
          peerWrap.style.maxHeight = measureClampedHeight(peerWrap, peerSummary, BOOK_COLLAPSED_LINES) + "px";
          attachTransitionEnd(peerWrap, "max-height", function () {
            if (peerSummary) {
              peerSummary.classList.remove("keep-unclamped");
              peerSummary.style.removeProperty("--peer-lines");
            }
            peerWrap.style.maxHeight = "";
            updateTruncationState(peerWrap, peerSummary);
          });
        }
        peer.classList.remove("book-card--peer-expanded");
      });
      attachTransitionEnd(activeWrap, "max-height", function () {
        activeCard.classList.remove("book-card--expanded");
        if (activeBody) activeBody.setAttribute("aria-expanded", "false");
        activeSummary.classList.remove("keep-unclamped");
        activeWrap.style.maxHeight = "";
        updateTruncationState(activeWrap, activeSummary);
      });
    }
  }
  function searchableText(book) {
    var parts = [];
    if (searchScopes.title) parts.push(book.title);
    if (searchScopes.author) parts.push(book.author);
    if (searchScopes.country) parts.push(book.country);
    if (searchScopes.summary) parts.push(book.summary);
    return parts.join(" ").toLowerCase();
  }

  function applyFilter() {
    var terms = activeTerms();
    var shown = 0;

    books.forEach(function (book) {
      var text = searchableText(book);
      var match = matchesSearch(text);
      var matchEl = book.el.querySelector(".book-card__match");
      book.el.style.display = match ? "" : "none";
      if (match) {
        shown++;
        if (terms.length && matchEl) {
          var preview = (searchScopes.title && buildMatchPreview("标题", book.title, terms)) ||
            (searchScopes.author && buildMatchPreview("作者", book.author, terms)) ||
            (searchScopes.country && buildMatchPreview("国家", book.country, terms)) ||
            (searchScopes.summary && buildMatchPreview("简介", book.summary, terms));
          if (preview) {
            matchEl.innerHTML = preview;
            matchEl.hidden = false;
          } else {
            matchEl.hidden = true;
          }
        } else if (matchEl) {
          matchEl.hidden = true;
        }
      } else if (matchEl) {
        matchEl.hidden = true;
      }
    });

    COUNT_SHOWN.textContent = shown;

    var existing = GRID_EL.querySelector(".book-empty");
    if (shown === 0 && books.length > 0) {
      if (!existing) {
        existing = document.createElement("p");
        existing.className = "book-empty empty-state";
        GRID_EL.appendChild(existing);
      }
      existing.innerHTML = '<div class="empty-state__icon">∅</div><p>没有匹配的书。换个关键词，或调整搜索范围。</p>';
    } else if (existing) {
      existing.remove();
    }
  }

  function renderChips() {
    CHIPS_EL.innerHTML = "";
    chips.forEach(function (term, idx) {
      var chipEl = document.createElement("span");
      chipEl.className = "chip";
      chipEl.setAttribute("role", "button");
      chipEl.setAttribute("tabindex", "0");
      chipEl.title = "点击回到输入框编辑";

      var termEl = document.createElement("span");
      termEl.className = "chip__term";
      termEl.textContent = term;
      chipEl.appendChild(termEl);

      function editChip() {
        INPUT_EL.value = term;
        chips.splice(idx, 1);
        renderChips();
        applyFilter();
        INPUT_EL.focus();
        try { INPUT_EL.setSelectionRange(INPUT_EL.value.length, INPUT_EL.value.length); } catch (e) {}
      }
      chipEl.addEventListener("click", editChip);
      chipEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          editChip();
        }
      });
      CHIPS_EL.appendChild(chipEl);
    });
  }

  function removeChipAt(idx) {
    if (removingChip || idx < 0 || idx >= chips.length) return;
    removingChip = true;
    var chipEl = CHIPS_EL.querySelector('[data-chip-index="' + idx + '"]');
    var opIndex = idx === 0 ? 0 : idx - 1;
    var opEl = CHIPS_EL.querySelector('[data-op-index="' + opIndex + '"]');
    if (chipEl) chipEl.classList.add("chip--removing");
    setTimeout(function () { if (opEl) opEl.classList.add("chip-op--removing"); }, 120);
    setTimeout(function () {
      chips.splice(idx, 1);
      if (idx === 0) chipOps.shift();
      else chipOps.splice(idx - 1, 1);
      if (idx < insertionIndex) insertionIndex--;
      insertionIndex = Math.max(0, Math.min(insertionIndex, chips.length));
      removingChip = false;
      renderChips();
      applyFilter();
    }, 220);
  }

  function appendCaretSlot(position) {
    if (position === insertionIndex) {
      CHIPS_EL.appendChild(INPUT_EL);
      return;
    }
    var slot = document.createElement("button");
    slot.type = "button";
    slot.className = "chip-caret-slot";
    slot.setAttribute("aria-label", "Insert search term at position " + position);
    slot.addEventListener("click", function () {
      insertionIndex = position;
      renderChips(false);
      INPUT_EL.focus();
    });
    CHIPS_EL.appendChild(slot);
  }

  function renderChips(animateChips) {
    var searchEl = CHIPS_EL.parentNode;
    var keepFocus = document.activeElement === INPUT_EL;
    searchEl.appendChild(INPUT_EL);
    CHIPS_EL.innerHTML = "";

    appendCaretSlot(0);
    chips.forEach(function (term, idx) {
      var chipEl = document.createElement("span");
      chipEl.className = animateChips === false ? "chip chip--static" : "chip";
      chipEl.dataset.chipIndex = String(idx);

      var termEl = document.createElement("button");
      termEl.type = "button";
      termEl.className = "chip__term";
      termEl.textContent = term;
      termEl.title = "Edit in place";
      chipEl.appendChild(termEl);

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "chip__remove";
      removeBtn.setAttribute("aria-label", "Delete search term " + term);
      removeBtn.textContent = "\u00d7";
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        removeChipAt(idx);
      });
      chipEl.appendChild(removeBtn);

      function editChip() {
        var original = chips[idx];
        var edit = document.createElement("input");
        edit.className = "chip__edit";
        edit.type = "text";
        edit.value = original;
        edit.setAttribute("aria-label", "Edit search term");
        termEl.replaceWith(edit);
        edit.focus();
        try { edit.setSelectionRange(edit.value.length, edit.value.length); } catch (e) {}

        var finished = false;
        function finish(save) {
          if (finished) return;
          finished = true;
          var value = edit.value.trim();
          if (save && value) chips[idx] = value;
          else if (save && !value) {
            removeChipAt(idx);
            return;
          } else if (!save) {
            chips[idx] = original;
          }
          renderChips();
          applyFilter();
        }
        edit.addEventListener("input", function () {
          chips[idx] = edit.value.trim();
          applyFilter();
        });
        edit.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        });
        edit.addEventListener("blur", function () { finish(true); });
      }
      termEl.addEventListener("click", editChip);
      CHIPS_EL.appendChild(chipEl);

      appendCaretSlot(idx + 1);
      if (idx < chips.length - 1) {
        var opIndex = idx;
        var op = document.createElement("button");
        op.type = "button";
        op.className = "chip-op chip-op--" + (chipOps[opIndex] || "and");
        op.textContent = (chipOps[opIndex] || "and").toUpperCase();
        op.title = "Toggle AND / OR";
        op.setAttribute("aria-label", "Toggle search term operator");
        op.dataset.opIndex = String(opIndex);
        op.addEventListener("click", function () {
          chipOps[opIndex] = chipOps[opIndex] === "or" ? "and" : "or";
          renderChips(false);
          applyFilter();
        });
        CHIPS_EL.appendChild(op);
      }
    });
    if (!INPUT_EL.parentNode || INPUT_EL.parentNode !== CHIPS_EL) CHIPS_EL.appendChild(INPUT_EL);
    INPUT_EL.classList.toggle("book-search__input--inline", insertionIndex < chips.length);
    INPUT_EL.setAttribute("placeholder", insertionIndex < chips.length ? "" : SEARCH_PLACEHOLDER);
    INPUT_EL.style.width = insertionIndex < chips.length
      ? Math.max(2, INPUT_EL.value.length + 1) + "ch"
      : "";
    if (insertionIndex < chips.length && !INPUT_EL.value) {
      var fixedPlaceholder = document.createElement("button");
      fixedPlaceholder.type = "button";
      fixedPlaceholder.className = "book-search__fixed-placeholder";
      fixedPlaceholder.textContent = SEARCH_PLACEHOLDER;
      fixedPlaceholder.setAttribute("aria-label", "Move to the end of the search bar");
      fixedPlaceholder.addEventListener("click", function () {
        insertionIndex = chips.length;
        renderChips(false);
        INPUT_EL.focus();
      });
      CHIPS_EL.appendChild(fixedPlaceholder);
    }
    if (keepFocus) INPUT_EL.focus();
  }

  function updateScopeLabel() {
    var names = [];
    if (searchScopes.title) names.push("标题");
    if (searchScopes.author) names.push("作者");
    if (searchScopes.country) names.push("国家");
    if (searchScopes.summary) names.push("简介");
    SCOPE_LABEL.textContent = names.length === 4 ? "全部" : (names.length ? names.join(" ") : "无");
  }

  function setSearchScopes(scopes) {
    searchScopes.title = scopes.indexOf("title") !== -1;
    searchScopes.author = scopes.indexOf("author") !== -1;
    searchScopes.country = scopes.indexOf("country") !== -1;
    searchScopes.summary = scopes.indexOf("summary") !== -1;
    SCOPE_EL.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
      input.checked = !!searchScopes[input.value];
    });
    updateScopeLabel();
    applyFilter();
  }

  function bindEvents() {
    INPUT_EL.addEventListener("input", function () {
      if (insertionIndex < chips.length) {
        INPUT_EL.style.width = Math.max(2, INPUT_EL.value.length + 1) + "ch";
      }
      applyFilter();
    });
    INPUT_EL.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        var value = INPUT_EL.value.trim();
        if (!value) return;
        if (chips.indexOf(value) === -1) {
          if (!chips.length) {
            chips.push(value);
          } else if (insertionIndex === 0) {
            chips.unshift(value);
            chipOps.unshift("and");
          } else if (insertionIndex >= chips.length) {
            chips.push(value);
            chipOps.push("and");
          } else {
            chips.splice(insertionIndex, 0, value);
            chipOps.splice(insertionIndex - 1, 0, "and");
          }
          insertionIndex++;
        }
        INPUT_EL.value = "";
        renderChips();
        applyFilter();
      } else if (e.key === "Backspace" && INPUT_EL.value === "" && chips.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (insertionIndex > 0) removeChipAt(insertionIndex - 1);
      } else if (e.key === "ArrowLeft" && INPUT_EL.value === "" && insertionIndex > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        insertionIndex--;
        renderChips(false);
        INPUT_EL.focus();
      } else if (e.key === "ArrowRight" && INPUT_EL.value === "" && insertionIndex < chips.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        insertionIndex++;
        renderChips(false);
        INPUT_EL.focus();
      }
    }, true);
    INPUT_EL.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var value = INPUT_EL.value.trim();
        if (!value) return;
        if (chips.indexOf(value) === -1) chips.push(value);
        INPUT_EL.value = "";
        renderChips();
        applyFilter();
      } else if (e.key === "Backspace" && INPUT_EL.value === "" && chips.length > 0) {
        INPUT_EL.value = chips.pop();
        renderChips();
        applyFilter();
        try { INPUT_EL.setSelectionRange(0, 0); } catch (e2) {}
        e.preventDefault();
      }
    });

    if (SEARCH_EL) {
      SEARCH_EL.addEventListener("click", function (e) {
        if (e.target !== SEARCH_EL && e.target !== CHIPS_EL) return;
        insertionIndex = chips.length;
        renderChips(false);
        INPUT_EL.focus();
      });
      SEARCH_EL.addEventListener("click", function (e) {
        if (e.target !== SEARCH_EL && e.target !== CHIPS_EL) return;
        INPUT_EL.focus();
      });
    }

    SCOPE_EL.addEventListener("change", function () {
      var checked = Array.prototype.slice.call(
        SCOPE_EL.querySelectorAll('input[type="checkbox"]:checked')
      ).map(function (input) { return input.value; });
      setSearchScopes(checked);
    });
    SCOPE_EL.addEventListener("click", function (e) {
      var action = e.target.closest("[data-scope-action]");
      if (!action) return;
      setSearchScopes(action.dataset.scopeAction === "all"
        ? ["title", "author", "country", "summary"]
        : []);
    });
    document.addEventListener("click", function (e) {
      if (SCOPE_EL.open && !SCOPE_EL.contains(e.target)) SCOPE_EL.open = false;
    });
  }

  function init() {
    if (!SOURCE_EL || !GRID_EL || !INPUT_EL) return;
    var cards = parseCards();
    COUNT_TOTAL.textContent = cards.length;
    if (!cards.length) {
      GRID_EL.innerHTML = '<div class="empty-state"><div class="empty-state__icon">□</div><p>暂无书目。</p></div>';
      COUNT_SHOWN.textContent = "0";
      var pel = document.getElementById("travel-page-loading"); if (pel) pel.classList.add("travel-page-loading--hidden");
      return;
    }
    renderCards(cards);
    updateScopeLabel();
    bindEvents();
    renderChips(false);
    applyFilter();
    INPUT_EL.setAttribute("placeholder", SEARCH_PLACEHOLDER);
      var pel = document.getElementById("travel-page-loading"); if (pel) pel.classList.add("travel-page-loading--hidden");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
