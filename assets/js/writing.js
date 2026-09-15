(function () {
  "use strict";

  function stickyOffset() {
    var offset = 12;
    [".site-header", ".writing-tabs"].forEach(function (selector) {
      var el = document.querySelector(selector);
      if (!el) return;
      var style = window.getComputedStyle(el);
      if (style.position !== "sticky" && style.position !== "fixed") return;
      var rect = el.getBoundingClientRect();
      if (rect.bottom > 0) offset = Math.max(offset, rect.bottom + 12);
    });
    return offset;
  }
  function syncStickyOffset() { document.documentElement.style.setProperty("--writing-sticky-offset", stickyOffset() + "px"); }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function scrollSummaryIntoView(summary) {
    if (!summary) return;
    var y = window.scrollY + summary.getBoundingClientRect().top - stickyOffset();
    window.scrollTo({
      top: Math.max(0, y),
      behavior: reduceMotion() ? "auto" : "smooth"
    });
  }

  function clearBodyAnimation(work) {
    var body = work.querySelector(".writing-work__body");
    work.classList.remove("writing-work--animating", "writing-work--opening", "writing-work--closing");
    if (!body) return;
    body.style.removeProperty("max-height");
    body.style.removeProperty("opacity");
  }

  function animateOpenWork(work, afterOpen) {
    if (!work || work.open) {
      if (afterOpen) afterOpen();
      return;
    }
    if (reduceMotion()) {
      work.open = true;
      if (afterOpen) afterOpen();
      updateFloatingCollapse();
      return;
    }

    var body = work.querySelector(".writing-work__body");
    if (!body) {
      work.open = true;
      if (afterOpen) afterOpen();
      updateFloatingCollapse();
      return;
    }

    clearBodyAnimation(work);
    work.open = true;
    updateFloatingCollapse();
    work.classList.add("writing-work--animating", "writing-work--opening");
    body.style.maxHeight = "0px";
    body.style.opacity = "0";
    body.offsetHeight;

    window.requestAnimationFrame(function () {
      body.style.maxHeight = body.scrollHeight + "px";
      body.style.opacity = "1";
    });

    waitForBodyTransition(work, function () {
      clearBodyAnimation(work);
      if (afterOpen) afterOpen();
      updateFloatingCollapse();
    });
  }

  function animateCloseWork(work, afterClose) {
    if (!work || !work.open) {
      if (afterClose) afterClose();
      return;
    }
    if (reduceMotion()) {
      work.open = false;
      if (afterClose) afterClose();
      updateFloatingCollapse();
      return;
    }

    var body = work.querySelector(".writing-work__body");
    if (!body) {
      work.open = false;
      if (afterClose) afterClose();
      updateFloatingCollapse();
      return;
    }

    clearBodyAnimation(work);
    work.classList.add("writing-work--animating", "writing-work--closing");
    body.style.maxHeight = body.scrollHeight + "px";
    body.style.opacity = "1";
    body.offsetHeight;

    window.requestAnimationFrame(function () {
      body.style.maxHeight = "0px";
      body.style.opacity = "0";
    });

    waitForBodyTransition(work, function () {
      work.open = false;
      clearBodyAnimation(work);
      if (afterClose) afterClose();
      updateFloatingCollapse();
    });
  }

  function waitForBodyTransition(work, callback) {
    var body = work.querySelector(".writing-work__body");
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      if (body) body.removeEventListener("transitionend", onEnd);
      callback();
    }
    function onEnd(event) {
      if (event.target === body && event.propertyName === "max-height") finish();
    }
    if (body) body.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, 520);
  }

  function keepSummaryNearPreviousTop(summary, previousTop) {
    if (!summary || typeof previousTop !== "number") return;
    var offset = stickyOffset();
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    var rect = summary.getBoundingClientRect();
    var maxTop = Math.max(offset, viewportHeight - rect.height - 16);
    var desiredTop = Math.min(Math.max(previousTop, offset), maxTop);
    window.scrollBy(0, rect.top - desiredTop);
  }

  function activePanel() {
    return document.querySelector("[data-writing-panel]:not([hidden])");
  }

  function openWorks() {
    var panel = activePanel() || document;
    return Array.prototype.slice.call(panel.querySelectorAll(".writing-work[open]"));
  }

  function currentOpenWork() {
    var works = openWorks();
    if (!works.length) return null;

    var targetY = stickyOffset() + (window.innerHeight - stickyOffset()) * 0.35;
    var best = works[0];
    var bestDistance = Infinity;
    works.forEach(function (work) {
      var rect = work.getBoundingClientRect();
      if (rect.top <= targetY && rect.bottom >= targetY) {
        best = work;
        bestDistance = 0;
        return;
      }
      var distance = Math.min(Math.abs(rect.top - targetY), Math.abs(rect.bottom - targetY));
      if (distance < bestDistance) {
        best = work;
        bestDistance = distance;
      }
    });
    return best;
  }

  function collapseWork(work) {
    if (!work) return;
    var summary = work.querySelector(".writing-work__summary");
    animateCloseWork(work, function () {
      scrollSummaryIntoView(summary);
    });
  }

  var floatingCollapse = null;
  var WRITING_TAB_STORAGE = "writing-active-tab";

  function updateFloatingCollapse() {
    if (!floatingCollapse) return;
    floatingCollapse.hidden = openWorks().length === 0;
  }

  function setActiveTab(tabName) {
    if (!document.querySelector("[data-writing-tab=\"" + tabName + "\"]")) tabName = "finished";

    document.querySelectorAll("[data-writing-tab]").forEach(function (tab) {
      var active = tab.getAttribute("data-writing-tab") === tabName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    document.querySelectorAll("[data-writing-panel]").forEach(function (panel) {
      var active = panel.getAttribute("data-writing-panel") === tabName;
      panel.hidden = !active;
    });

    try { localStorage.setItem(WRITING_TAB_STORAGE, tabName); } catch (error) { /* Use the in-memory state only. */ }
    updateFloatingCollapse();
  }

  function collapseOtherWorks(activeWork) {
    var summary = activeWork.querySelector(".writing-work__summary");
    var previousTop = summary ? summary.getBoundingClientRect().top : null;
    var panel = activeWork.closest("[data-writing-panel]") || document;
    var others = Array.prototype.slice.call(panel.querySelectorAll(".writing-work[open]"))
      .filter(function (work) { return work !== activeWork; });
    if (!others.length) return;

    others.forEach(function (work) { animateCloseWork(work); });
    updateFloatingCollapse();
    window.setTimeout(function () {
      keepSummaryNearPreviousTop(summary, previousTop);
    }, reduceMotion() ? 0 : 340);
  }

  function hashTarget() {
    if (!window.location.hash) return null;
    var id;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch (error) {
      id = window.location.hash.slice(1);
    }
    var target = document.getElementById(id);
    return target && target.matches(".writing-work") ? target : null;
  }

  function openHashTarget() {
    var work = hashTarget();
    if (!work) return;
    var summary = work.querySelector(".writing-work__summary");

    collapseOtherWorks(work);
    animateOpenWork(work, function () {
      scrollSummaryIntoView(summary);
    });
  }

  function initPostSearch() {
    var input = document.getElementById("post-search-input");
    if (!input) return;

    var cards = Array.prototype.slice.call(document.querySelectorAll(".post-card"));
    var count = document.getElementById("post-search-count");
    var scopeLabel = document.getElementById("post-search-scope-label");
    var scopeDetails = document.getElementById("post-search-scope");
    var scopeInputs = Array.prototype.slice.call(document.querySelectorAll("[data-post-search-scope]"));

    var cardData = cards.map(function (card) {
      var titleEl = card.querySelector(".writing-work__title");
      var tagEls = Array.prototype.slice.call(card.querySelectorAll(".post-card__tag"));
      var bodyEl = card.querySelector(".writing-work__body");
      var previewEl = card.querySelector(".post-card__match");
      return {
        card: card,
        titleEl: titleEl,
        title: titleEl ? titleEl.textContent.trim() : "",
        tagEls: tagEls,
        bodyEl: bodyEl,
        body: bodyEl ? bodyEl.textContent.replace(/\s+/g, " ").trim() : "",
        previewEl: previewEl,
        previewLabel: previewEl.querySelector(".post-card__match-label"),
        previewIndex: previewEl.querySelector(".post-card__match-index"),
        previewText: previewEl.querySelector(".post-card__match-text"),
        previewPrev: previewEl.querySelector(".post-card__match-nav--prev"),
        previewNext: previewEl.querySelector(".post-card__match-nav--next"),
        matches: [],
        matchIndex: 0
      };
    });

    function activeScopes() {
      var active = {};
      scopeInputs.forEach(function (checkbox) { active[checkbox.value] = checkbox.checked; });
      return active;
    }

    function updateScopeLabel() {
      var selected = scopeInputs.filter(function (checkbox) { return checkbox.checked; });
      scopeLabel.textContent = selected.length === scopeInputs.length
        ? "全部"
        : (selected.length ? selected.map(function (checkbox) {
          return checkbox.parentElement.textContent.trim();
        }).join("、") : "未选择");
    }

    function collectOccurrences(text, query, callback) {
      var lower = text.toLocaleLowerCase();
      var position = 0;
      while ((position = lower.indexOf(query, position)) !== -1) {
        callback(position);
        position += Math.max(query.length, 1);
      }
    }

    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, function (character) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
      });
    }

    function previewHtml(text, offset, length) {
      var start = Math.max(0, offset - 36);
      var end = Math.min(text.length, offset + length + 64);
      var before = text.slice(start, offset);
      var hit = text.slice(offset, offset + length);
      var after = text.slice(offset + length, end);
      return (start ? "…" : "") + escapeHtml(before) +
        '<mark class="post-card__match-hit">' + escapeHtml(hit) + "</mark>" +
        escapeHtml(after) + (end < text.length ? "…" : "");
    }

    function clearCardHighlight(data) {
      data.card.querySelectorAll("mark.post-search-hit").forEach(function (mark) {
        var parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
      });
    }

    function highlightOccurrence(root, query, wantedIndex) {
      if (!root) return null;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var nodes = [];
      var node;
      while ((node = walker.nextNode())) nodes.push(node);
      var seen = 0;
      for (var i = 0; i < nodes.length; i++) {
        var text = nodes[i].textContent;
        var lower = text.toLocaleLowerCase();
        var position = 0;
        while ((position = lower.indexOf(query, position)) !== -1) {
          if (seen === wantedIndex) {
            var range = document.createRange();
            range.setStart(nodes[i], position);
            range.setEnd(nodes[i], position + query.length);
            var mark = document.createElement("mark");
            mark.className = "post-search-hit";
            range.surroundContents(mark);
            return mark;
          }
          seen++;
          position += Math.max(query.length, 1);
        }
      }
      return null;
    }

    function syncCardHighlight(data, shouldMove) {
      clearCardHighlight(data);
      if (!data.matches.length) return;
      var match = data.matches[data.matchIndex];
      if (match.field === "body" && !data.card.open) return;
      var mark = highlightOccurrence(match.root, match.query, match.occurrence);
      if (shouldMove && mark) {
        mark.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
      }
    }

    function updateCardMatch(data, shouldMove) {
      if (!data.matches.length) {
        data.previewEl.hidden = true;
        clearCardHighlight(data);
        return;
      }
      data.matchIndex = (data.matchIndex + data.matches.length) % data.matches.length;
      var match = data.matches[data.matchIndex];
      var matchedFields = [];
      data.matches.forEach(function (item) {
        if (matchedFields.indexOf(item.label) === -1) matchedFields.push(item.label);
      });
      data.previewLabel.textContent = matchedFields.join(" · ") + " · " + data.matches.length + " 处匹配";
      data.previewIndex.textContent = "[" + (data.matchIndex + 1) + "/" + data.matches.length + "]";
      data.previewText.innerHTML = previewHtml(match.source, match.offset, match.query.length);
      data.previewPrev.disabled = data.matches.length < 2;
      data.previewNext.disabled = data.matches.length < 2;
      data.previewEl.hidden = false;
      syncCardHighlight(data, shouldMove);
    }

    function selectCardMatch(data, nextIndex) {
      if (!data.matches.length) return;
      data.matchIndex = nextIndex;
      updateCardMatch(data, true);
    }

    function applySearch() {
      var rawQuery = input.value.trim();
      var query = rawQuery.toLocaleLowerCase();
      var scopes = activeScopes();
      var shown = 0;
      var totalMatches = 0;

      cardData.forEach(function (data) {
        clearCardHighlight(data);
        var cardMatches = [];
        if (query && scopes.title) {
          var titleOccurrence = 0;
          collectOccurrences(data.title, query, function (offset) {
            cardMatches.push({ data: data, field: "title", label: "标题", root: data.titleEl,
              occurrence: titleOccurrence++, query: query, source: data.title, offset: offset });
          });
        }
        if (query && scopes.tag) {
          data.tagEls.forEach(function (tagEl) {
            var tagText = tagEl.textContent.trim();
            var tagOccurrence = 0;
            collectOccurrences(tagText, query, function (offset) {
              cardMatches.push({ data: data, field: "tag", label: "标签", root: tagEl,
                occurrence: tagOccurrence++, query: query, source: tagText, offset: offset });
            });
          });
        }
        if (query && scopes.body) {
          var bodyOccurrence = 0;
          collectOccurrences(data.body, query, function (offset) {
            cardMatches.push({ data: data, field: "body", label: "正文", root: data.bodyEl,
              occurrence: bodyOccurrence++, query: query, source: data.body, offset: offset });
          });
        }
        data.matches = cardMatches;
        data.matchIndex = 0;
        var visible = !query || cardMatches.length > 0;
        data.card.hidden = !visible;
        data.card.classList.toggle("post-card--searching", !!query && visible);
        if (visible) shown++;
        totalMatches += cardMatches.length;
        if (query && visible) updateCardMatch(data, false);
        else data.previewEl.hidden = true;
      });

      if (!query) {
        count.textContent = "共 " + cardData.length + " 篇文章";
        return;
      }
      count.textContent = "显示 " + shown + " / " + cardData.length + " 篇文章 · " + totalMatches + " 处匹配";
    }

    input.addEventListener("input", applySearch);
    cardData.forEach(function (data) {
      data.previewPrev.addEventListener("click", function (event) {
        event.stopPropagation();
        selectCardMatch(data, data.matchIndex - 1);
      });
      data.previewNext.addEventListener("click", function (event) {
        event.stopPropagation();
        selectCardMatch(data, data.matchIndex + 1);
      });
      data.previewEl.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.target.closest("button")) return;
        if (data.card.open) {
          animateCloseWork(data.card);
        } else {
          animateOpenWork(data.card, function () { syncCardHighlight(data, false); });
          collapseOtherWorks(data.card);
        }
      });
      data.card.addEventListener("toggle", function () {
        if (data.card.open) syncCardHighlight(data, false);
        else clearCardHighlight(data);
      });
    });
    scopeInputs.forEach(function (checkbox) {
      checkbox.addEventListener("change", function () { updateScopeLabel(); applySearch(); });
    });
    document.querySelectorAll("[data-post-scope-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var checked = button.dataset.postScopeAction === "all";
        scopeInputs.forEach(function (checkbox) { checkbox.checked = checked; });
        updateScopeLabel();
        applySearch();
      });
    });
    document.addEventListener("click", function (event) {
      if (scopeDetails && scopeDetails.open && !scopeDetails.contains(event.target)) scopeDetails.open = false;
    });
    updateScopeLabel();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.body.classList.add("writing-js-ready");
    syncStickyOffset();
    window.addEventListener("resize", syncStickyOffset, { passive: true });
    floatingCollapse = document.createElement("button");
    floatingCollapse.className = "writing-floating-collapse";
    floatingCollapse.type = "button";
    floatingCollapse.textContent = "收回";
    floatingCollapse.hidden = true;
    document.body.appendChild(floatingCollapse);
    floatingCollapse.addEventListener("click", function () {
      collapseWork(currentOpenWork());
    });

    var writingTabs = document.querySelectorAll("[data-writing-tab]");
    writingTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        setActiveTab(tab.getAttribute("data-writing-tab"));
      });
    });

    if (writingTabs.length) {
      var savedWritingTab = "finished";
      try { savedWritingTab = localStorage.getItem(WRITING_TAB_STORAGE) || savedWritingTab; } catch (error) { /* Use the default tab. */ }
      setActiveTab(savedWritingTab);
    }

    document.querySelectorAll(".writing-work__collapse").forEach(function (button) {
      button.addEventListener("click", function () {
        collapseWork(button.closest(".writing-work"));
      });
    });

    document.querySelectorAll(".writing-work").forEach(function (work) {
      var summary = work.querySelector(".writing-work__summary");
      if (summary) {
        summary.addEventListener("click", function (event) {
          event.preventDefault();
          if (work.open) {
            animateCloseWork(work);
          } else {
            animateOpenWork(work);
            collapseOtherWorks(work);
          }
        });
      }
    });
    window.addEventListener("scroll", updateFloatingCollapse, { passive: true });
    window.addEventListener("hashchange", openHashTarget);
    updateFloatingCollapse();
    openHashTarget();
    initPostSearch();
  });
})();
