(function () {
  "use strict";

  var CARD_ANIM_MS = 300;
  var CARD_EXPAND_EASING = "cubic-bezier(0.55, 0.055, 0.675, 0.19)";
  var CARD_COLLAPSE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
  var WRITING_TAB_STORAGE = "writing-active-tab";
  var currentExpanded = null;
  var activeScrollAnimation = null;
  var floatingCollapse = null;
  var operationVersions = new WeakMap();
  var HASH_TO_TAB = { writings: "finished", stories: "chain" };
  var TAB_TO_HASH = { finished: "writings", chain: "stories" };

  function works() {
    return Array.prototype.slice.call(document.querySelectorAll(
      '[data-writing-panel="finished"] .writing-work[data-writing-work]'
    ));
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

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

  function nextOperation(work) {
    var version = (operationVersions.get(work) || 0) + 1;
    operationVersions.set(work, version);
    return version;
  }

  function isCurrentOperation(work, version) {
    return operationVersions.get(work) === version;
  }

  function cancelScrollAnimation() {
    if (activeScrollAnimation === null) return;
    cancelAnimationFrame(activeScrollAnimation);
    activeScrollAnimation = null;
  }

  function easeInOut(value) {
    return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
  }

  function animateScrollTo(targetY, duration, work, version) {
    cancelScrollAnimation();
    var startY = window.scrollY || window.pageYOffset || 0;
    var destination = Math.max(0, targetY);
    var delta = destination - startY;
    if (Math.abs(delta) < 1) return;
    if (reduceMotion()) {
      window.scrollTo(0, destination);
      return;
    }

    var startTime = null;
    function tick(now) {
      if (work && !isCurrentOperation(work, version)) {
        activeScrollAnimation = null;
        return;
      }
      if (startTime === null) startTime = now;
      var progress = Math.min(1, (now - startTime) / duration);
      window.scrollTo(0, startY + delta * easeInOut(progress));
      if (progress < 1) activeScrollAnimation = requestAnimationFrame(tick);
      else activeScrollAnimation = null;
    }
    activeScrollAnimation = requestAnimationFrame(tick);
  }

  function lockElementViewportTop(el, desiredTop, duration, work, version) {
    if (!el || typeof desiredTop !== "number") return;
    cancelScrollAnimation();
    if (reduceMotion()) {
      var reducedRect = el.getBoundingClientRect();
      window.scrollBy(0, reducedRect.top - desiredTop);
      return;
    }

    var startTime = null;
    function tick(now) {
      if (!isCurrentOperation(work, version)) {
        activeScrollAnimation = null;
        return;
      }
      if (startTime === null) startTime = now;
      var progress = Math.min(1, (now - startTime) / duration);
      var rect = el.getBoundingClientRect();
      var correction = (rect.top - desiredTop) * (1 - easeInOut(progress) * 0.15);
      if (Math.abs(correction) > 0.5) window.scrollBy(0, correction);
      if (progress < 1) activeScrollAnimation = requestAnimationFrame(tick);
      else activeScrollAnimation = null;
    }
    activeScrollAnimation = requestAnimationFrame(tick);
  }

  function clearLayoutInline(el) {
    if (!el) return;
    el.classList.remove("writing-work--layout-moving");
    el.style.removeProperty("transition");
    el.style.removeProperty("transform");
    el.style.removeProperty("transform-origin");
    el.style.removeProperty("width");
    el.style.removeProperty("height");
  }

  function prepareOperation(work) {
    clearLayoutInline(work);
    clearLayoutInline(work.querySelector(".writing-work__body"));
    work.classList.remove(
      "writing-work--body-animating",
      "writing-work--opening",
      "writing-work--closing",
      "writing-work--peer-fading"
    );
    var body = work.querySelector(".writing-work__body");
    var inner = work.querySelector(".writing-work__body-inner");
    if (body) body.style.removeProperty("max-height");
    if (inner) inner.classList.remove("keep-unclamped");
  }

  function snapshotLayout(work) {
    var body = work.querySelector(".writing-work__body");
    return {
      card: work,
      body: body,
      cardRect: work.getBoundingClientRect(),
      bodyRect: body ? body.getBoundingClientRect() : null
    };
  }

  function animateNodeFromRect(el, beforeRect, afterRect, work, version, easing) {
    if (!el || !beforeRect || !afterRect || reduceMotion()) return;
    var dx = beforeRect.left - afterRect.left;
    var dy = beforeRect.top - afterRect.top;
    var changed = Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5 ||
      Math.abs(beforeRect.width - afterRect.width) >= 0.5 ||
      Math.abs(beforeRect.height - afterRect.height) >= 0.5;
    if (!changed) return;

    el.classList.add("writing-work--layout-moving");
    el.style.transition = "none";
    el.style.transformOrigin = "top left";
    el.style.width = beforeRect.width + "px";
    el.style.height = beforeRect.height + "px";
    el.style.transform = "translate(" + dx + "px, " + dy + "px)";
    el.offsetHeight;

    requestAnimationFrame(function () {
      if (!isCurrentOperation(work, version)) return;
      el.style.transition = "transform " + CARD_ANIM_MS +
        "ms " + easing + ", width " + CARD_ANIM_MS +
        "ms " + easing + ", height " + CARD_ANIM_MS +
        "ms " + easing;
      el.style.transform = "";
      el.style.width = afterRect.width + "px";
      el.style.height = afterRect.height + "px";
    });

    window.setTimeout(function () {
      if (isCurrentOperation(work, version)) clearLayoutInline(el);
    }, CARD_ANIM_MS + 160);
  }

  function animateNodeFromDelta(el, dx, dy, work, version, easing) {
    if (!el || reduceMotion() || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)) return;
    el.classList.add("writing-work--layout-moving");
    el.style.transition = "none";
    el.style.transform = "translate(" + dx + "px, " + dy + "px)";
    el.offsetHeight;

    requestAnimationFrame(function () {
      if (!isCurrentOperation(work, version)) return;
      el.style.transition = "transform " + CARD_ANIM_MS + "ms " + easing;
      el.style.transform = "";
    });

    window.setTimeout(function () {
      if (isCurrentOperation(work, version)) clearLayoutInline(el);
    }, CARD_ANIM_MS + 160);
  }

  function animateLayout(before, afterCardRect, afterBodyRect, work, version, easing) {
    if (!before || reduceMotion()) return;
    animateNodeFromRect(before.card, before.cardRect, afterCardRect, work, version, easing);
    if (!before.body || !before.bodyRect || !afterBodyRect) return;
    var beforeLeft = before.bodyRect.left - before.cardRect.left;
    var beforeTop = before.bodyRect.top - before.cardRect.top;
    var afterLeft = afterBodyRect.left - afterCardRect.left;
    var afterTop = afterBodyRect.top - afterCardRect.top;
    animateNodeFromDelta(before.body, beforeLeft - afterLeft, beforeTop - afterTop, work, version, easing);
  }

  function fadePeerCardsIn(activeWork) {
    if (reduceMotion()) return;
    works().forEach(function (work) {
      if (work === activeWork || work.hidden) return;
      work.classList.add("writing-work--peer-fading");
      work.offsetHeight;
      requestAnimationFrame(function () { work.classList.remove("writing-work--peer-fading"); });
    });
  }

  function keepCollapsingCardVisible(work, beforeRect, version) {
    var offset = stickyOffset();
    var viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
    if (beforeRect.top >= offset && beforeRect.top <= viewportBottom - 96) return;
    var desiredTop = beforeRect.top < offset ? offset : Math.max(offset, viewportBottom - 128);
    lockElementViewportTop(work, desiredTop, CARD_ANIM_MS, work, version);
  }

  function revealAfterCollapse(work, version) {
    if (!isCurrentOperation(work, version) || work.classList.contains("writing-work--expanded")) return;
    var rect = work.getBoundingClientRect();
    var offset = stickyOffset();
    var viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
    var currentY = window.scrollY || window.pageYOffset || 0;
    if (rect.top < offset) {
      animateScrollTo(currentY + rect.top - offset, CARD_ANIM_MS, work, version);
    } else if (rect.bottom > viewportBottom - 16) {
      animateScrollTo(currentY + rect.bottom - viewportBottom + 16, CARD_ANIM_MS, work, version);
    }
  }

  function updateFloatingCollapse() {
    if (!floatingCollapse) return;
    floatingCollapse.hidden = !currentExpanded ||
      !currentExpanded.classList.contains("writing-work--expanded") ||
      currentExpanded.closest("[data-writing-panel]").hidden;
  }

  function collapseWork(work, options) {
    options = options || {};
    if (!work || !work.classList.contains("writing-work--expanded")) return;
    var version = nextOperation(work);
    prepareOperation(work);
    var body = work.querySelector(".writing-work__body");
    var inner = work.querySelector(".writing-work__body-inner");
    var summary = work.querySelector(".writing-work__summary");

    if (!body || reduceMotion()) {
      work.classList.remove("writing-work--expanded");
      if (summary) summary.setAttribute("aria-expanded", "false");
      if (currentExpanded === work) currentExpanded = null;
      updateFloatingCollapse();
      if (options.reveal) revealAfterCollapse(work, version);
      return;
    }

    var before = snapshotLayout(work);
    inner.classList.add("keep-unclamped");
    body.style.transition = "none";
    body.style.removeProperty("max-height");
    work.classList.remove("writing-work--expanded", "writing-work--body-animating", "writing-work--opening");
    work.classList.add("writing-work--closing");
    summary.setAttribute("aria-expanded", "false");
    if (currentExpanded === work) currentExpanded = null;
    updateFloatingCollapse();

    var afterCardRect = work.getBoundingClientRect();
    var afterBodyRect = body.getBoundingClientRect();
    body.offsetHeight;
    body.style.removeProperty("transition");
    animateLayout(before, afterCardRect, afterBodyRect, work, version, CARD_COLLAPSE_EASING);
    if (options.reveal) keepCollapsingCardVisible(work, before.cardRect, version);
    fadePeerCardsIn(work);

    window.setTimeout(function () {
      if (!isCurrentOperation(work, version)) return;
      work.classList.remove("writing-work--closing");
      inner.classList.remove("keep-unclamped");
      body.style.removeProperty("max-height");
      if (options.reveal) revealAfterCollapse(work, version);
    }, CARD_ANIM_MS + 80);
  }

  function expandWork(work) {
    if (!work || work.classList.contains("writing-work--expanded")) return;
    var version = nextOperation(work);
    prepareOperation(work);
    var before = snapshotLayout(work);
    var summary = work.querySelector(".writing-work__summary");
    var body = work.querySelector(".writing-work__body");
    var inner = work.querySelector(".writing-work__body-inner");
    if (!summary || !body || !inner) return;

    var title = work.querySelector(".writing-work__title");
    var titleTop = title ? title.getBoundingClientRect().top : null;
    var otherWorks = works().filter(function (other) {
      return other !== work && other.classList.contains("writing-work--expanded");
    });
    var replacingAnother = otherWorks.length > 0;
    otherWorks.forEach(function (other) { collapseWork(other, { reveal: false }); });

    inner.classList.add("keep-unclamped");
    work.classList.add("writing-work--body-animating", "writing-work--opening", "writing-work--expanded");
    summary.setAttribute("aria-expanded", "true");
    currentExpanded = work;
    updateFloatingCollapse();

    body.style.transition = "none";
    body.style.maxHeight = body.scrollHeight + "px";
    var afterCardRect = work.getBoundingClientRect();
    var afterBodyRect = body.getBoundingClientRect();
    body.offsetHeight;
    body.style.removeProperty("transition");
    animateLayout(before, afterCardRect, afterBodyRect, work, version, CARD_EXPAND_EASING);
    if (replacingAnother && title) {
      lockElementViewportTop(title, titleTop, CARD_ANIM_MS, work, version);
    }

    window.setTimeout(function () {
      if (!isCurrentOperation(work, version) || !work.classList.contains("writing-work--expanded")) return;
      work.classList.remove("writing-work--body-animating", "writing-work--opening");
      inner.classList.remove("keep-unclamped");
      body.style.removeProperty("max-height");
    }, CARD_ANIM_MS + 80);
  }

  function toggleWork(work) {
    if (work.classList.contains("writing-work--expanded")) collapseWork(work, { reveal: true });
    else expandWork(work);
  }

  function resetWorks() {
    cancelScrollAnimation();
    works().forEach(function (work) {
      nextOperation(work);
      clearLayoutInline(work);
      var body = work.querySelector(".writing-work__body");
      var inner = work.querySelector(".writing-work__body-inner");
      clearLayoutInline(body);
      work.classList.remove(
        "writing-work--expanded", "writing-work--body-animating",
        "writing-work--opening", "writing-work--closing", "writing-work--peer-fading"
      );
      if (body) body.style.removeProperty("max-height");
      if (inner) inner.classList.remove("keep-unclamped");
      var summary = work.querySelector(".writing-work__summary");
      if (summary) summary.setAttribute("aria-expanded", "false");
    });
    currentExpanded = null;
    updateFloatingCollapse();
  }

  function setActiveTab(tabName) {
    if (!document.querySelector('[data-writing-tab="' + tabName + '"]')) tabName = "finished";
    if (tabName !== "finished") resetWorks();
    document.documentElement.dataset.writingView = tabName;

    document.querySelectorAll("[data-writing-tab]").forEach(function (tab) {
      var active = tab.dataset.writingTab === tabName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-writing-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.writingPanel !== tabName;
    });
    try { localStorage.setItem(WRITING_TAB_STORAGE, tabName); } catch (error) { /* In-memory state is enough. */ }
    var newHash = TAB_TO_HASH[tabName];
    if (newHash && window.location.hash !== "#" + newHash) history.replaceState(null, "", "#" + newHash);
    updateFloatingCollapse();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.body.classList.add("writing-js-ready");

    floatingCollapse = document.createElement("button");
    floatingCollapse.className = "writing-floating-collapse";
    floatingCollapse.type = "button";
    floatingCollapse.textContent = "收回";
    floatingCollapse.hidden = true;
    document.body.appendChild(floatingCollapse);
    floatingCollapse.addEventListener("click", function () {
      if (currentExpanded) collapseWork(currentExpanded, { reveal: true });
    });

    works().forEach(function (work) {
      var summary = work.querySelector(".writing-work__summary");
      var body = work.querySelector(".writing-work__body");
      if (summary) summary.addEventListener("click", function () { toggleWork(work); });
      if (body) body.addEventListener("click", function (event) {
        if (window.getSelection().toString().length > 0) return;
        if (event.target.closest("a, button")) return;
        toggleWork(work);
      });
      var collapse = work.querySelector(".writing-work__collapse");
      if (collapse) collapse.addEventListener("click", function (event) {
        event.stopPropagation();
        collapseWork(work, { reveal: true });
      });
    });

    document.querySelectorAll("[data-writing-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () { setActiveTab(tab.dataset.writingTab); });
    });

    var savedTab = "finished";
    try { savedTab = localStorage.getItem(WRITING_TAB_STORAGE) || savedTab; } catch (error) { /* Use default. */ }
    setActiveTab(savedTab);

    var hashTab = HASH_TO_TAB[window.location.hash.slice(1)];
    if (hashTab) setActiveTab(hashTab);
    window.addEventListener("hashchange", function () { var hashTab = HASH_TO_TAB[window.location.hash.slice(1)]; if (hashTab) setActiveTab(hashTab); });
  });
}());
