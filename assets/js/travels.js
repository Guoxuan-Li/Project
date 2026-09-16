// ════════════════════════════════════════════════════════════
//   travels.js —— 旅迹页面（主逻辑）
//
//   H1 = 国家，H2 = 城市（每条 H2 拆一张卡片），括号如 "(3d)" 提取为时长。
//   交互：实时全文搜索（匹配预览 + 正文虚化 + 上/下一个导航）、
//   卡片展开/收起、城市详情弹窗。
//   世界地图 → travels-map.js；旅途汇总 → travels-summary.js
// ════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var SOURCE_EL = document.getElementById("travel-source");
  var GRID_EL = document.getElementById("travel-grid");
  var INPUT_EL = document.getElementById("travel-search-input");
  var CHIPS_EL = document.getElementById("travel-chips");
  var SEARCH_EL = INPUT_EL ? INPUT_EL.closest(".travel-search") : null;
  var COUNT_TOTAL = document.getElementById("travel-count-total");
  var COUNT_SHOWN = document.getElementById("travel-count-shown");
  var COUNT_TYPE = document.getElementById("travel-count-type");
  var MAP_EL = document.getElementById("travel-map-container");
  var FILTERS_EL = document.getElementById("travel-filters");
  var SCOPE_EL = document.getElementById("travel-search-scope");
  var SCOPE_LABEL = document.getElementById("travel-search-scope-label");
  var activeContinent = "all";
  var searchScopes = { region: true, title: true, body: true };
  var cardTypes = { country: true, city: true };

  var currentExpanded = null;
  var chips = [];
  var chipOps = [];         // chips 之间的连接符；chipOps[i] 连接 chips[i] 和 chips[i + 1]
  var insertionIndex = 0;   // 主输入光标位于第几个词条之前
  var removingChip = false;
  var cardData = [];        // { el, title, country, continent, attractions, bodyText, previewEl }
  var matchedCards = [];
  var cardMatchItems = {};
  var cardMatchIdx = {};
  var FLOATING_EL = null;
  var BORDER_EL = null;
  var GROUP_TITLE_ELS = [];
  var SEARCH_PLACEHOLDER = INPUT_EL ? INPUT_EL.getAttribute("placeholder") : "";
  var CARD_ANIM_MS = 300;
  var activeScrollAnimation = null;
  var TRAVEL_CACHE_KEY = "x-gx-h-travel-cards-v5";
  var resolvedCards = null;

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function getSourceCardCount() {
    var source = SOURCE_EL.content || SOURCE_EL;
    var continent = "欧洲";
    var countries = {};
    var cityCount = 0;
    Array.prototype.forEach.call(source.childNodes, function (node) {
      if (node.nodeType !== 1) return;
      if (node.dataset && node.dataset.travelContinent) {
        continent = node.dataset.travelContinent.trim() || "未知";
      } else if (node.tagName === "H1") {
        countries[continent + "\u0000" + node.textContent.trim()] = true;
      } else if (node.tagName === "H2") {
        cityCount++;
      }
    });
    return cityCount + Object.keys(countries).length;
  }

  function serializeCard(card) {
    return {
      type: card.type,
      title: card.title,
      duration: card.duration || null,
      country: card.country,
      continent: card.continent,
      bodyHtml: nodesToHtml(card.bodyNodes || []),
      visitedCities: card.visitedCities || [],
      coveredProvinces: card.coveredProvinces || []
    };
  }

  function deserializeCard(card) {
    var template = document.createElement("template");
    template.innerHTML = card.bodyHtml || "";
    return {
      type: card.type,
      title: card.title,
      duration: card.duration,
      country: card.country,
      continent: card.continent,
      bodyNodes: Array.prototype.slice.call(template.content.childNodes),
      visitedCities: card.visitedCities || [],
      coveredProvinces: card.coveredProvinces || []
    };
  }

  function readCardCache() {
    try {
      var cached = JSON.parse(localStorage.getItem(TRAVEL_CACHE_KEY) || "null");
      return cached && cached.version === 1 && cached.source === SOURCE_EL.innerHTML && Array.isArray(cached.cards) &&
        cached.count === cached.cards.length ? cached : null;
    } catch (error) {
      return null;
    }
  }

  function saveCardCache(cards) {
    var save = function () {
      try {
        localStorage.setItem(TRAVEL_CACHE_KEY, JSON.stringify({
          source: SOURCE_EL.innerHTML,
          version: 1,
          count: cards.length,
          cards: cards.map(serializeCard)
        }));
      } catch (error) { /* Cache is optional. */ }
    };
    if (window.requestIdleCallback) window.requestIdleCallback(save, { timeout: 1500 });
    else setTimeout(save, 0);
  }

  function sortCards(cards) {
    cards.sort(function (a, b) {
      if (a.type !== b.type) return a.type === "city" ? -1 : 1;
      var order = { "欧洲": 0, "亚洲": 1, "中国": 2 };
      var aGroup = order[a.continent] != null ? order[a.continent] : 1;
      var bGroup = order[b.continent] != null ? order[b.continent] : 1;
      if (aGroup !== bGroup) return aGroup - bGroup;
      var cc = a.country.localeCompare(b.country, "zh-Hans-CN");
      if (cc) return cc;
      return a.title.localeCompare(b.title, "zh-Hans-CN");
    });
    return cards;
  }

  function cardCacheKey(card) {
    return [card.type, card.continent, card.country, card.title, card.duration || ""].join("\u0000");
  }

  function getCards() {
    if (resolvedCards) return resolvedCards;
    var sourceCount = getSourceCardCount();
    var cached = readCardCache();
    if (cached && cached.count === sourceCount) {
      resolvedCards = cached.cards.map(deserializeCard);
      return resolvedCards;
    }

    var freshCards = sortCards(parseCards());
    if (cached) {
      var cachedByKey = {};
      cached.cards.forEach(function (card) {
        var key = cardCacheKey(card);
        (cachedByKey[key] || (cachedByKey[key] = [])).push(card);
      });
      freshCards = freshCards.map(function (card) {
        var serialized = serializeCard(card);
        var candidates = cachedByKey[cardCacheKey(serialized)] || [];
        for (var i = 0; i < candidates.length; i++) {
          if (JSON.stringify(candidates[i]) === JSON.stringify(serialized)) {
            return deserializeCard(candidates.splice(i, 1)[0]);
          }
        }
        return card;
      });
    }
    resolvedCards = freshCards;
    saveCardCache(resolvedCards);
    return resolvedCards;
  }

  // ════════════ 解析模板 → 城市卡片 ════════════

  function parseCards() {
    var cards = [];
    var container = document.createElement("div");
    container.innerHTML = SOURCE_EL.innerHTML;
    var currentCountry = null, currentContinent = "欧洲", currentCity = null;
    var countryNodes = [], bodyNodes = [], cityCards = [];
    function finishCity() {
      if (!currentCity) return;
      cityCards.push(makeCard(currentCity, currentCountry, currentContinent, bodyNodes));
      currentCity = null; bodyNodes = [];
    }
    function finishCountry() {
      if (!currentCountry) return;
      finishCity();
      var coveredProvinces = [];
      cityCards.forEach(function (card) {
        var province = getCardProvince(card);
        if (province && coveredProvinces.indexOf(province) === -1) coveredProvinces.push(province);
      });
      cards.push({ type: "country", title: currentCountry, country: currentCountry,
        continent: currentContinent || "未知", duration: null,
        bodyNodes: countryNodes,
        visitedCities: cityCards.map(function (card) { return card.title; }),
        coveredProvinces: coveredProvinces });
      cards = cards.concat(cityCards);
      countryNodes = []; cityCards = [];
      currentCountry = null;
    }
    for (var i = 0; i < container.childNodes.length; i++) {
      var node = container.childNodes[i];
      if (node.nodeType === 1 && node.dataset && node.dataset.travelContinent) {
        finishCountry();
        currentContinent = node.dataset.travelContinent.trim() || "未知";
      } else if (node.nodeType === 1 && node.tagName === "H1") {
        finishCountry();
        currentCountry = node.textContent.trim();
      } else if (node.nodeType === 1 && node.tagName === "H2") {
        finishCity();
        var h2Text = node.textContent.trim();
        var duration = null;
        var m = h2Text.match(/[（(]([^)）]+)[)）]\s*$/);
        if (m) { duration = m[1]; h2Text = h2Text.replace(/\s*[（(][^)）]+[)）]\s*$/, "").trim(); }
        currentCity = { title: h2Text, duration: duration };
        bodyNodes = [];
      } else if (currentCity) {
        bodyNodes.push(node);
      } else if (currentCountry) {
        countryNodes.push(node);
      }
    }
    finishCountry();
    var cities = [];
    var countries = {};
    var countryOrder = [];
    cards.forEach(function (card) {
      if (card.type === "city") {
        cities.push(card);
        return;
      }
      var key = card.continent + "\u0000" + card.country;
      if (!countries[key]) {
        countries[key] = card;
        countryOrder.push(key);
        return;
      }
      countries[key].bodyNodes = countries[key].bodyNodes.concat(card.bodyNodes);
      card.visitedCities.forEach(function (city) {
        if (countries[key].visitedCities.indexOf(city) === -1) countries[key].visitedCities.push(city);
      });
      card.coveredProvinces.forEach(function (province) {
        if (countries[key].coveredProvinces.indexOf(province) === -1) countries[key].coveredProvinces.push(province);
      });
    });
    return cities.concat(countryOrder.map(function (key) { return countries[key]; }));
  }

  function makeCard(city, country, continent, nodes) {
    return { type: "city", title: city.title, duration: city.duration, country: country || "未知",
             continent: continent || "未知", bodyNodes: nodes };
  }
  function nodesToHtml(nodes) {
    var d = document.createElement("div");
    nodes.forEach(function (n) { d.appendChild(n.cloneNode(true)); });
    return d.innerHTML;
  }
 function nodesToText(nodes) {
   var d = document.createElement("div");
   nodes.forEach(function (n) { d.appendChild(n.cloneNode(true)); });
   return (d.textContent || "").replace(/\s+/g, " ").trim();
 }
  function getCardProvince(card) {
    var province = "";
    (card.bodyNodes || []).some(function (node) {
      if (!node || node.nodeType !== 1) return false;
      var el = node.matches && node.matches(".travel-province")
        ? node : (node.querySelector ? node.querySelector(".travel-province") : null);
      if (!el) return false;
      province = (el.textContent || "").trim();
      return !!province;
    });
    return province;
  }

 function syncContinentFilters(cards) {
   if (!FILTERS_EL) return;
    // Collect unique continents that actually have cards
    var activeContinents = {};
    cards.forEach(function (card) {
      activeContinents[card.continent] = true;
    });

    // Remove existing buttons (except "all") whose continent has no cards
    FILTERS_EL.querySelectorAll("[data-continent]").forEach(function (button) {
      if (button.dataset.continent === "all") return;
      if (!activeContinents[button.dataset.continent]) {
        if (activeContinent === button.dataset.continent) {
          activeContinent = "all";
        }
        button.parentNode.removeChild(button);
      }
    });

    // Add buttons for continents that have cards but are not yet rendered
    var existing = {};
    FILTERS_EL.querySelectorAll("[data-continent]").forEach(function (button) {
      existing[button.dataset.continent] = true;
    });

    var preferredOrder = { "欧洲": 1, "中国": 2, "亚洲": 3 };
    var continents = Object.keys(activeContinents).filter(function (c) {
      return !existing[c];
    });
    continents.sort(function (a, b) {
      return (preferredOrder[a] || 99) - (preferredOrder[b] || 99) || a.localeCompare(b, "zh-Hans-CN");
    });
    continents.forEach(function (continent) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "travel-filters__chip";
      button.dataset.continent = continent;
      button.textContent = continent;
      FILTERS_EL.appendChild(button);
    });
  }

  // ════════════ 渲染卡片 ════════════

  function clearWidthReveal(cardEl) {
    cardEl.classList.remove("travel-card--width-reveal", "travel-card--width-revealed");
    cardEl.style.removeProperty("--travel-card-reveal-left");
    cardEl.style.removeProperty("--travel-card-reveal-right");
  }

  function clearTravelBorder() {
    if (BORDER_EL && BORDER_EL.parentNode) BORDER_EL.parentNode.removeChild(BORDER_EL);
    BORDER_EL = null;
  }

  function rectToGridRect(rect) {
    var gridRect = GRID_EL.getBoundingClientRect();
    return {
      left: rect.left - gridRect.left,
      top: rect.top - gridRect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function setBorderRect(el, rect) {
    el.style.width = rect.width + "px";
    el.style.height = rect.height + "px";
    el.style.transform = "translate(" + rect.left + "px, " + rect.top + "px)";
  }

  function expandedTargetGridRect(cardRect, bodyRect, targetBodyHeight) {
    var gridRect = rectToGridRect(cardRect);
    gridRect.height = cardRect.height - bodyRect.height + targetBodyHeight;
    return gridRect;
  }

  function snapshotCardLayout(card) {
    var body = card.querySelector(".travel-card__body");
    return {
      card: card,
      body: body,
      cardRect: card.getBoundingClientRect(),
      bodyRect: body ? body.getBoundingClientRect() : null
    };
  }

  function setPeerCardsMuted(activeCard, muted) {
    Array.prototype.slice.call(GRID_EL.querySelectorAll(".travel-card")).forEach(function (card) {
      if (card === activeCard) {
        card.classList.remove("travel-card--layout-muted");
        return;
      }
      if (card.style.display === "none") return;
      card.classList.toggle("travel-card--layout-muted", muted);
    });
  }

  function fadePeerCardsIn(activeCard) {
    if (reduceMotion()) return;
    Array.prototype.slice.call(GRID_EL.querySelectorAll(".travel-card")).forEach(function (card) {
      if (card === activeCard || card.style.display === "none") return;
      card.classList.remove("travel-card--layout-muted");
      card.classList.add("travel-card--peer-fading");
      card.offsetHeight;
      requestAnimationFrame(function () {
        card.classList.remove("travel-card--peer-fading");
      });
    });
  }

  function animateLayoutNodeFromRect(el, beforeRect, afterRect) {
    if (!el || !beforeRect || !afterRect) return;
    var dx = beforeRect.left - afterRect.left;
    var dy = beforeRect.top - afterRect.top;
    var widthChanged = Math.abs(beforeRect.width - afterRect.width) >= 0.5;
    var heightChanged = Math.abs(beforeRect.height - afterRect.height) >= 0.5;
    var moved = Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5;
    if (!moved && !widthChanged && !heightChanged) return;

    el.classList.add("travel-card--layout-moving");
    el.style.transition = "none";
    el.style.transformOrigin = "top left";
    el.style.width = beforeRect.width + "px";
    el.style.height = beforeRect.height + "px";
    el.style.transform = "translate(" + dx + "px, " + dy + "px)";
    el.offsetHeight;

    requestAnimationFrame(function () {
      el.style.transition = "transform " + CARD_ANIM_MS + "ms cubic-bezier(0.25, 0.46, 0.45, 0.94), width " + CARD_ANIM_MS + "ms cubic-bezier(0.25, 0.46, 0.45, 0.94), height " + CARD_ANIM_MS + "ms cubic-bezier(0.25, 0.46, 0.45, 0.94), border-color 200ms ease, box-shadow 200ms ease";
      el.style.transform = "";
      el.style.width = afterRect.width + "px";
      el.style.height = afterRect.height + "px";
    });

    el.addEventListener("transitionend", function onMoveEnd(e) {
      if (e.target !== el || (e.propertyName !== "transform" && e.propertyName !== "width" && e.propertyName !== "height")) return;
      el.removeEventListener("transitionend", onMoveEnd);
      el.classList.remove("travel-card--layout-moving");
      el.style.removeProperty("transition");
      el.style.removeProperty("transform");
      el.style.removeProperty("transform-origin");
      el.style.removeProperty("width");
      el.style.removeProperty("height");
    });
    setTimeout(function () {
      el.classList.remove("travel-card--layout-moving");
      el.style.removeProperty("transition");
      el.style.removeProperty("transform");
      el.style.removeProperty("transform-origin");
      el.style.removeProperty("width");
      el.style.removeProperty("height");
    }, CARD_ANIM_MS + 160);
  }

  function animateLayoutNodeFromDelta(el, dx, dy) {
    if (!el) return;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    el.classList.add("travel-card--layout-moving");
    el.style.transition = "none";
    el.style.transform = "translate(" + dx + "px, " + dy + "px)";
    el.offsetHeight;

    requestAnimationFrame(function () {
      el.style.transition = "";
      el.style.transform = "";
    });

    el.addEventListener("transitionend", function onMoveEnd(e) {
      if (e.target !== el || e.propertyName !== "transform") return;
      el.removeEventListener("transitionend", onMoveEnd);
      el.classList.remove("travel-card--layout-moving");
      el.style.removeProperty("transition");
      el.style.removeProperty("transform");
    });
    setTimeout(function () {
      el.classList.remove("travel-card--layout-moving");
      el.style.removeProperty("transition");
      el.style.removeProperty("transform");
    }, CARD_ANIM_MS + 160);
  }

  function animateCurrentCardLayout(before, afterCardRect, afterBodyRect) {
    if (!before || !afterCardRect || reduceMotion()) return;
    animateLayoutNodeFromRect(before.card, before.cardRect, afterCardRect);
    if (before.body && before.bodyRect && afterBodyRect) {
      var beforeBodyLeft = before.bodyRect.left - before.cardRect.left;
      var beforeBodyTop = before.bodyRect.top - before.cardRect.top;
      var afterBodyLeft = afterBodyRect.left - afterCardRect.left;
      var afterBodyTop = afterBodyRect.top - afterCardRect.top;
      animateLayoutNodeFromDelta(before.body, beforeBodyLeft - afterBodyLeft, beforeBodyTop - afterBodyTop);
    }
  }

  function animateTravelBorder(fromRect, toRect) {
    if (!fromRect || !toRect || reduceMotion()) return;
    if (window.BORDER_TIMER) clearTimeout(window.BORDER_TIMER);
    clearTravelBorder();
    BORDER_EL = document.createElement("div");
    BORDER_EL.className = "travel-card-outline";
    setBorderRect(BORDER_EL, fromRect);
    GRID_EL.appendChild(BORDER_EL);
    BORDER_EL.offsetHeight;

    requestAnimationFrame(function () {
      if (!BORDER_EL) return;
      BORDER_EL.classList.add("is-active");
      setBorderRect(BORDER_EL, toRect);
    });

    BORDER_EL.addEventListener("transitionend", function onEnd(e) {
      if (e.target !== BORDER_EL || e.propertyName !== "transform") return;
      BORDER_EL.removeEventListener("transitionend", onEnd);
      if (window.BORDER_TIMER) clearTimeout(window.BORDER_TIMER);
      window.BORDER_TIMER = null;
      clearTravelBorder();
    });
    window.BORDER_TIMER = setTimeout(clearTravelBorder, 650);
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function stickyOffset() {
    var header = document.querySelector(".site-header");
    var height = header ? header.getBoundingClientRect().height : 0;
    return height + 12;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function cancelScrollAnimation() {
    if (activeScrollAnimation !== null) {
      cancelAnimationFrame(activeScrollAnimation);
      activeScrollAnimation = null;
    }
  }

  function animateScrollTo(targetY, duration) {
    cancelScrollAnimation();
    var startY = window.scrollY || window.pageYOffset || 0;
    var delta = Math.max(0, targetY) - startY;
    if (Math.abs(delta) < 1) return;
    if (reduceMotion()) {
      window.scrollTo(0, Math.max(0, targetY));
      return;
    }
    var startTime = null;
    function tick(now) {
      if (startTime === null) startTime = now;
      var progress = Math.min(1, (now - startTime) / duration);
      window.scrollTo(0, startY + delta * easeInOut(progress));
      if (progress < 1) {
        activeScrollAnimation = requestAnimationFrame(tick);
      } else {
        activeScrollAnimation = null;
      }
    }
    activeScrollAnimation = requestAnimationFrame(tick);
  }

  function lockElementViewportTop(el, desiredTop, duration) {
    if (!el || typeof desiredTop !== "number") return;
    cancelScrollAnimation();
    if (reduceMotion()) {
      var rect = el.getBoundingClientRect();
      window.scrollTo(0, Math.max(0, (window.scrollY || window.pageYOffset || 0) + rect.top - desiredTop));
      return;
    }
    var startTime = null;
    function tick(now) {
      if (startTime === null) startTime = now;
      var progress = Math.min(1, (now - startTime) / duration);
      var easedProgress = easeInOut(progress);
      var rect = el.getBoundingClientRect();
      var correction = (rect.top - desiredTop) * (1 - easedProgress * 0.15);
      if (Math.abs(correction) > 0.5) window.scrollBy(0, correction);
      if (progress < 1) {
        activeScrollAnimation = requestAnimationFrame(tick);
      } else {
        activeScrollAnimation = null;
      }
    }
    activeScrollAnimation = requestAnimationFrame(tick);
  }

  function keepTitleAtViewportTop(titleEl, previousTop) {
    if (!titleEl || typeof previousTop !== "number") return;
    lockElementViewportTop(titleEl, previousTop, CARD_ANIM_MS);
  }

  function keepCollapsingCardVisible(cardEl, beforeRect) {
    if (!cardEl || !beforeRect) return;
    var offset = stickyOffset();
    var viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
    if (beforeRect.top >= offset && beforeRect.top <= viewportBottom - 96) return;
    var desiredTop = beforeRect.top < offset ? offset : Math.max(offset, viewportBottom - 128);
    lockElementViewportTop(cardEl, desiredTop, CARD_ANIM_MS);
  }

  function revealCardAfterCollapse(cardEl) {
    if (!cardEl) return;
    var rect = cardEl.getBoundingClientRect();
    var offset = stickyOffset();
    var viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
    var margin = 16;
    var currentY = window.scrollY || window.pageYOffset || 0;
    if (rect.top < offset) {
      animateScrollTo(currentY + rect.top - offset, CARD_ANIM_MS);
    } else if (rect.bottom > viewportBottom - margin) {
      animateScrollTo(currentY + rect.bottom - viewportBottom + margin, CARD_ANIM_MS);
    }
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
    setTimeout(finish, 650);
  }




function collapseExpandedCard(cardEl, options) {
  options = options || {};
  if (!cardEl || !cardEl.classList.contains("travel-card--expanded")) return;
  var body = cardEl.querySelector(".travel-card__body");
  var inner = cardEl.querySelector(".travel-card__body-inner");

  clearWidthReveal(cardEl);
  hideFloatingOverlay();

  if (!body || reduceMotion()) {
    cardEl.classList.remove("travel-card--expanded", "travel-card--body-animating", "travel-card--expanding", "travel-card--collapsing");
    if (inner) inner.classList.remove("keep-unclamped");
    if (body) body.style.removeProperty("max-height");
    if (currentExpanded === cardEl) currentExpanded = null;
    if (options.reveal) revealCardAfterCollapse(cardEl);
    return;
  }

  var beforeLayout = snapshotCardLayout(cardEl);
  if (inner) inner.classList.add("keep-unclamped");
  body.style.transition = "none";
  body.style.maxHeight = "7.5rem";
  cardEl.classList.remove("travel-card--expanded", "travel-card--expanding", "travel-card--body-animating");
  cardEl.classList.add("travel-card--collapsing");
  var afterRect = cardEl.getBoundingClientRect();
  var afterBodyRect = body.getBoundingClientRect();
  body.offsetHeight;
  body.style.removeProperty("transition");
  animateCurrentCardLayout(beforeLayout, afterRect, afterBodyRect);
  if (options.reveal) keepCollapsingCardVisible(cardEl, beforeLayout.cardRect);
  fadePeerCardsIn(cardEl);

  requestAnimationFrame(function () {
    cardEl.style.borderColor = "#F3ECE2";
  });

  setTimeout(function () {
    cardEl.classList.remove("travel-card--collapsing");
    if (inner) inner.classList.remove("keep-unclamped");
    body.style.removeProperty("max-height");
    cardEl.style.removeProperty("border-color");
    if (currentExpanded === cardEl) currentExpanded = null;
    if (options.reveal) revealCardAfterCollapse(cardEl);
  }, CARD_ANIM_MS + 80);
}

  function revealExpandedWidth(cardEl, beforeRect, afterRect) {
    if (!beforeRect || reduceMotion()) {
      clearWidthReveal(cardEl);
      return;
    }

    afterRect = afterRect || cardEl.getBoundingClientRect();
    var left = Math.max(0, beforeRect.left - afterRect.left);
    var right = Math.max(0, afterRect.right - beforeRect.right);
    var visibleWidth = afterRect.width - left - right;
    if (visibleWidth < 1 || Math.abs(afterRect.width - beforeRect.width) < 1) {
      clearWidthReveal(cardEl);
      return;
    }

    cardEl.classList.remove("travel-card--width-revealed");
    cardEl.classList.add("travel-card--width-reveal");
    cardEl.style.setProperty("--travel-card-reveal-left", left + "px");
    cardEl.style.setProperty("--travel-card-reveal-right", right + "px");

    requestAnimationFrame(function () {
      cardEl.classList.add("travel-card--width-revealed");
    });

    cardEl.addEventListener("transitionend", function onRevealEnd(e) {
      if (e.propertyName !== "clip-path" && e.propertyName !== "-webkit-clip-path") return;
      cardEl.removeEventListener("transitionend", onRevealEnd);
      clearWidthReveal(cardEl);
    });
  }

  function renderCards(cards) {
    GRID_EL.innerHTML = "";
    cardData = [];
    cards.forEach(function (card, i) {
      var displayTitle = card.type === "country" && card.country === "中国" ? "中国 China" : card.title;
      var article = document.createElement("article");
      article.className = "travel-card";
      article.classList.add("travel-card--" + card.type);
      article.dataset.index = String(i);

      var attractions = [];
      var bodyText = nodesToText(card.bodyNodes);
      if (card.type === "country") {
        var coveredPlaces = card.country === "中国" ? card.coveredProvinces : card.visitedCities;
        bodyText = (bodyText + " " + coveredPlaces.join(" ")).trim();
        if (!nodesToText(card.bodyNodes)) article.classList.add("travel-card--no-intro");
      }
      card.bodyNodes.forEach(function (node) {
        if (node.nodeType === 1 && node.tagName === "H3") attractions.push(node.textContent.trim());
      });
      article.dataset.searchText = (
        displayTitle + " " + card.country + " " + card.continent +
        " " + attractions.join(" ") + " " + bodyText
      ).toLowerCase();
      article.dataset.continent = card.continent;

      var header = document.createElement("header");
      header.className = "travel-card__header";
      var headerText = document.createElement("div");
      headerText.className = "travel-card__header-text";
      var title = document.createElement("h3");
      title.className = "travel-card__title";
      title.textContent = displayTitle;
      headerText.appendChild(title);
      var subtitle = document.createElement("p");
      subtitle.className = "travel-card__subtitle";
      var provinceText = getCardProvince(card);
      var subText = card.type === "country" ? card.continent + " · 国家总览"
        : (provinceText ? provinceText + " · " + card.country : card.country + " · " + card.continent);
      if (card.duration) subText += " · " + card.duration;
      subtitle.textContent = subText;
      headerText.appendChild(subtitle);
      header.appendChild(headerText);

      var previewEl = document.createElement("div");
      previewEl.className = "travel-card__match";
      previewEl.setAttribute("hidden", "");
      var previewLabel = document.createElement("span");
      previewLabel.className = "travel-card__match-label";
      var previewIndex = document.createElement("span");
      previewIndex.className = "travel-card__match-index";
      var previewText = document.createElement("span");
      previewText.className = "travel-card__match-text";
      var previewMeta = document.createElement("div");
      previewMeta.className = "travel-card__match-meta";
      var previewContent = document.createElement("div");
      previewContent.className = "travel-card__match-content";
      function expandArticle() {
        var layoutBefore = snapshotCardLayout(article);
        var titleTopBefore = title.getBoundingClientRect().top;
        var shouldKeepTitlePosition = currentExpanded && currentExpanded !== article;
        if (currentExpanded && currentExpanded !== article) {
          collapseExpandedCard(currentExpanded, { reveal: false });
        }
        inner.classList.add("keep-unclamped");
        article.classList.add("travel-card--body-animating", "travel-card--expanding");
        article.classList.add("travel-card--expanded");
        currentExpanded = article;
        var targetHeight = body.scrollHeight;
        body.style.transition = "none";
        body.style.maxHeight = targetHeight + "px";
        var afterRect = article.getBoundingClientRect();
        var afterBodyRect = body.getBoundingClientRect();
        body.offsetHeight;
        body.style.removeProperty("transition");
        animateCurrentCardLayout(layoutBefore, afterRect, afterBodyRect);
        if (shouldKeepTitlePosition) keepTitleAtViewportTop(title, titleTopBefore);
        setTimeout(function () {
          if (!article.classList.contains("travel-card--expanded")) return;
          article.classList.remove("travel-card--body-animating", "travel-card--expanding");
          inner.classList.remove("keep-unclamped");
          body.style.removeProperty("max-height");
        }, CARD_ANIM_MS + 80);
        showFloatingOverlay(i);
        highlightBodyMatches(article, i);
      }
      function collapseArticle() {
        collapseExpandedCard(article, { reveal: true });
      }
     previewEl.addEventListener("click", function (e) {
       e.stopPropagation();
       var isExp = article.classList.contains("travel-card--expanded");
        if (isExp) collapseArticle();
        else expandArticle();
     });

      var body = document.createElement("div");
      body.className = "travel-card__body";
      var inner = document.createElement("div");
      inner.className = "travel-card__body-inner prose";
      inner.innerHTML = nodesToHtml(card.bodyNodes);
      var countryPlaces = card.country === "中国" ? card.coveredProvinces : card.visitedCities;
      if (card.type === "country" && countryPlaces.length) {
        var cities = document.createElement("section");
        cities.className = "travel-card__visited-cities";
        cities.innerHTML = card.country === "中国" ? "<h3>覆盖的省份</h3>" : "<h3>去过的城市</h3>";
        var citiesList = document.createElement("div");
        citiesList.className = "travel-card__city-list";
        countryPlaces.forEach(function (place) {
          var tag = document.createElement("span"); tag.textContent = place; citiesList.appendChild(tag);
        });
        cities.appendChild(citiesList); inner.appendChild(cities);
      }
      if (card.type === "city") {
        var foodLink = document.createElement("a");
        foodLink.className = "travel-card__food-link";
        foodLink.href = (document.body.dataset.baseurl || "") + "/food/?city=" + encodeURIComponent(displayTitle.split(" ")[0]);
        foodLink.textContent = "看看这座城的味道 →";
        inner.appendChild(foodLink);
      }
      body.appendChild(inner);

      article.appendChild(header);
     article.appendChild(body);
     article.appendChild(previewEl);
      var prevBtn = document.createElement("button");
      prevBtn.className = "travel-card__match-nav travel-card__match-nav--prev";
      prevBtn.type = "button";
      prevBtn.setAttribute("aria-label", "上一个匹配");
      prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.addEventListener("click", function (e) { e.stopPropagation(); navigateCardMatch(i, -1); });
      var nextBtn = document.createElement("button");
      nextBtn.className = "travel-card__match-nav travel-card__match-nav--next";
      nextBtn.type = "button";
      nextBtn.setAttribute("aria-label", "下一个匹配");
      nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.addEventListener("click", function (e) { e.stopPropagation(); navigateCardMatch(i, 1); });
      previewMeta.appendChild(previewLabel);
      previewMeta.appendChild(previewIndex);
      previewContent.appendChild(prevBtn);
      previewContent.appendChild(previewText);
      previewContent.appendChild(nextBtn);
      previewEl.appendChild(previewMeta);
      previewEl.appendChild(previewContent);

      function toggle() {
        var isExpanded = article.classList.contains("travel-card--expanded");
        if (isExpanded) collapseArticle();
        else expandArticle();
      }
      header.addEventListener("click", toggle);
      body.addEventListener("click", function (e) {
        if (window.getSelection().toString().length > 0) return;
        if (e.target.closest("a")) return;
        toggle();
      });

      GRID_EL.appendChild(article);
      cardData.push({
        el: article, type: card.type, title: displayTitle, country: card.country, continent: card.continent,
        attractions: attractions, bodyText: bodyText, previewEl: previewEl,
        previewLabel: previewLabel, previewIndex: previewIndex, previewText: previewText,
        previewPrev: prevBtn, previewNext: nextBtn
      });
    });
  }

  // ════════════ 搜索（全文 + 匹配预览 + 虚化 + 导航）════════════

  function activeTerms() {
    var rawTerms = (INPUT_EL.value || "").trim().split(/\s+/).filter(Boolean);
    return chips.concat(rawTerms).map(function (t) { return t.toLowerCase(); }).filter(Boolean);
  }

  function matchesSearch(text) {
    var rawTerms = (INPUT_EL.value || "").trim().split(/\s+/).filter(Boolean)
      .map(function (t) { return t.toLowerCase(); });
    var lockedTerms = chips.map(function (t) { return t.toLowerCase(); }).filter(Boolean);
    var terms = lockedTerms.slice();
    var ops = chipOps.slice();
    if (rawTerms.length) {
      var position = Math.max(0, Math.min(insertionIndex, terms.length));
      terms.splice.apply(terms, [position, 0].concat(rawTerms));
      var insertedOps = [];
      for (var r = 1; r < rawTerms.length; r++) insertedOps.push("and");
      if (!lockedTerms.length) {
        ops = insertedOps;
      } else if (position === 0) {
        ops = insertedOps.concat(["and"], ops);
      } else if (position === lockedTerms.length) {
        ops = ops.concat(["and"], insertedOps);
      } else {
        ops = ops.slice(0, position - 1)
          .concat(["and"], insertedOps, [ops[position - 1] || "and"], ops.slice(position));
      }
    }
    if (!terms.length) return true;

    // AND 优先：OR 把表达式分成若干组，每组内全部命中即可。
    var groups = [[]];
    terms.forEach(function (term, idx) {
      if (idx > 0) {
        var op = ops[idx - 1] || "and";
        if (op === "or") groups.push([]);
      }
      groups[groups.length - 1].push(term);
    });
    return groups.some(function (group) {
      return group.every(function (term) { return text.indexOf(term) !== -1; });
    });
  }
  function buildSnippet(originalText, lowerText, terms) {
    var bestIdx = -1, bestTerm = null;
    for (var i = 0; i < terms.length; i++) {
      var idx = lowerText.indexOf(terms[i]);
      if (idx >= 0 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestTerm = terms[i]; }
    }
    if (bestIdx < 0) return null;
    var radius = 34;
    var start = Math.max(0, bestIdx - radius);
    var end = Math.min(originalText.length, bestIdx + bestTerm.length + radius);
    return { text: (start > 0 ? "…" : "") + originalText.slice(start, end) + (end < originalText.length ? "…" : "") };
  }
  function findMatchItems(cards, terms) {
    var items = [];
    cards.forEach(function (d) {
      if (d.el.style.display === "none") return;
      var low = d.bodyText.toLowerCase();
      terms.forEach(function (t) {
        if (!t) return;
        var pos = 0;
        while ((pos = low.indexOf(t, pos)) !== -1) {
          items.push({ cardData: d, offset: pos, termLen: t.length });
          pos += t.length;
        }
      });
    });
    return items;
  }
  function buildMatchSnippet(text, offset, termLen) {
    var end = Math.min(text.length, offset + termLen + 80);
    return {
      before: "",
      hit: text.slice(offset, offset + termLen),
      after: text.slice(offset + termLen, end) + (end < text.length ? " …" : "")
    };
  }
  function countHits(lowerText, terms) {
    var total = 0;
    terms.forEach(function (t) {
      if (!t) return;
      var p = 0;
      while ((p = lowerText.indexOf(t, p)) !== -1) { total++; p += t.length; }
    });
    return total;
  }
  function highlightTerms(escaped, terms) {
    var valid = terms.filter(function (t) { return !!t; });
    if (!valid.length) return escaped;
    var re = new RegExp("(" + valid.map(escapeReg).join("|") + ")", "gi");
    return escaped.replace(re, '<mark class="travel-hit">$1</mark>');
  }
  function buildPreview(data, terms) {
    var directTitle = searchScopes.title;
    if (directTitle) {
      var lowerDirectTitle = data.title.toLowerCase();
      var directTitleHit = terms.find(function (term) { return lowerDirectTitle.indexOf(term) >= 0; });
      if (directTitleHit) {
        return { kind: "heading", label: data.type === "country" ? "国家标题命中" : "城市标题命中",
                 html: highlightTerms(escapeHtml(data.title), terms) };
      }
    }
    if (searchScopes.region) {
      var locationText = (data.country + " " + data.continent).toLowerCase();
      var locationHit = terms.find(function (term) { return locationText.indexOf(term) >= 0; });
      if (locationHit) {
        return { kind: "heading", label: "国家 / 地区命中", html: highlightTerms(escapeHtml(data.country), terms) };
      }
    }
    if (searchScopes.body) {
      var lowerBody = data.bodyText.toLowerCase();
      var bodyHit = buildSnippet(data.bodyText, lowerBody, terms);
      if (bodyHit) {
        var hits = countHits(lowerBody, terms);
        return { kind: "body", label: hits > 1 ? ("正文 · " + hits + " 处命中") : "正文命中",
                 html: highlightTerms(escapeHtml(bodyHit.text), terms) };
      }
    }
    return null;
  }
  function collectCardMatches() {
    cardMatchItems = {};
    cardMatchIdx = {};
    var terms = activeTerms();
    if (!terms.length || !searchScopes.body) return;
    cardData.forEach(function (d, idx) {
      if (d.el.style.display === "none") return;
      var matches = [];
      terms.forEach(function (t) {
        if (!t) return;
        var matcher = new RegExp(escapeReg(t), "gi");
        var found;
        while ((found = matcher.exec(d.bodyText)) !== null) {
          var pos = found.index;
          var hitLength = found[0].length;
          var snippet = buildMatchSnippet(d.bodyText, pos, hitLength);
          matches.push({
            offset: pos,
            termLen: hitLength,
            term: t,
            previewHtml: escapeHtml(snippet.before) +
              '<mark class="travel-hit">' + escapeHtml(snippet.hit) + '</mark>' +
              escapeHtml(snippet.after)
          });
          if (!hitLength) matcher.lastIndex++;
        }
      });
      matches.sort(function (a, b) { return a.offset - b.offset; });
      if (matches.length) {
        cardMatchItems[idx] = matches;
        cardMatchIdx[idx] = 0;
      }
    });
  }

  function updateCardMatchPreview(cardIdx) {
    var matches = cardMatchItems[cardIdx];
    if (!matches || !matches.length) return;
    var mi = cardMatchIdx[cardIdx];
    var d = cardData[cardIdx];
    d.previewLabel.textContent = "正文 \u00b7 " + matches.length + " 处命中";
    d.previewIndex.textContent = "[" + (mi + 1) + "/" + matches.length + "]";
    d.previewText.innerHTML = matches[mi].previewHtml;
    d.previewPrev.disabled = matches.length < 2;
    d.previewNext.disabled = matches.length < 2;
    d.previewEl.hidden = false;
  }

  function focusCurrentBodyMatch(cardIdx) {
    var d = cardData[cardIdx];
    var current = d.el.querySelector(".travel-hit-current");
    if (!current) return;
    current.setAttribute("tabindex", "-1");
    current.focus({ preventScroll: true });
    current.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function selectCardMatch(cardIdx, nextIdx, moveFocus) {
    var matches = cardMatchItems[cardIdx];
    if (!matches || !matches.length) return;
    cardMatchIdx[cardIdx] = (nextIdx + matches.length) % matches.length;
    updateCardMatchPreview(cardIdx);
    var d = cardData[cardIdx];
    if (d.el.classList.contains("travel-card--expanded")) {
      highlightBodyMatches(d.el, cardIdx);
      updateFloatingOverlay(cardIdx);
      if (moveFocus) focusCurrentBodyMatch(cardIdx);
    }
  }

  function navigateCardMatch(cardIdx, dir) {
    selectCardMatch(cardIdx, (cardMatchIdx[cardIdx] || 0) + dir, true);
  }

 function highlightBodyMatches(cardEl, cardIdx) {
    var body = cardEl.querySelector('.travel-card__body-inner');
    if (!body) return;
    if (!body.dataset.origHtml) {
      body.dataset.origHtml = body.innerHTML;
    }
    var matches = cardMatchItems[cardIdx];
    if (!matches || !matches.length) {
      body.innerHTML = body.dataset.origHtml;
      return;
    }
    body.innerHTML = body.dataset.origHtml;
    var terms = activeTerms().filter(Boolean).sort(function (a, b) { return b.length - a.length; });
    if (!terms.length) return;
    var re = new RegExp("(" + terms.map(escapeReg).join("|") + ")", "gi");
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    var nodes = [];
    var node;
    while (node = walker.nextNode()) {
      if (re.test(node.textContent)) nodes.push(node);
      re.lastIndex = 0;
    }
    nodes.forEach(function (textNode) {
      var fragment = document.createDocumentFragment();
      var last = 0;
      textNode.textContent.replace(re, function (hit, _group, offset) {
        fragment.appendChild(document.createTextNode(textNode.textContent.slice(last, offset)));
        var mark = document.createElement("mark");
        mark.className = "travel-hit-body";
        mark.textContent = hit;
        fragment.appendChild(mark);
        last = offset + hit.length;
        return hit;
      });
      fragment.appendChild(document.createTextNode(textNode.textContent.slice(last)));
      textNode.parentNode.replaceChild(fragment, textNode);
      re.lastIndex = 0;
    });
    var highlighted = body.querySelectorAll(".travel-hit-body");
    var currentIdx = cardMatchIdx[cardIdx] || 0;
    if (highlighted[currentIdx]) highlighted[currentIdx].className = "travel-hit-current";
  }

  function showFloatingOverlay(cardIdx) {
    var cardMatches = cardMatchItems[cardIdx];
    if (!activeTerms().length || !cardMatches || !cardMatches.length) {
      hideFloatingOverlay();
      return;
    }
    if (!FLOATING_EL) {
      FLOATING_EL = document.createElement('div');
      FLOATING_EL.className = 'travel-floating-nav';
      FLOATING_EL.innerHTML =
        '<div class="travel-floating-nav__inner">' +
        '<span class="travel-floating-nav__count">\u7b2c <strong id="float-match-current">1</strong> / <span id="float-match-total">0</span> \u4e2a\u5339\u914d</span>' +
        '<button type="button" class="travel-floating-nav__btn" id="float-prev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="18 15 12 9 6 15"/></svg></button>' +
        '<button type="button" class="travel-floating-nav__btn" id="float-next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg></button>' +
        '</div>';
      document.body.appendChild(FLOATING_EL);
      document.getElementById('float-prev').addEventListener('click', function () {
        var idx = parseInt(FLOATING_EL.dataset.cardIdx);
        var fl = cardMatchItems[idx];
        if (!fl) return;
        selectCardMatch(idx, (cardMatchIdx[idx] || 0) - 1, true);
      });
      document.getElementById('float-next').addEventListener('click', function () {
        var idx = parseInt(FLOATING_EL.dataset.cardIdx);
        var fl = cardMatchItems[idx];
        if (!fl) return;
        selectCardMatch(idx, (cardMatchIdx[idx] || 0) + 1, true);
      });
    }
    FLOATING_EL.dataset.cardIdx = cardIdx;
    FLOATING_EL.hidden = false;
    var m = cardMatches;
    document.getElementById('float-match-current').textContent = String((cardMatchIdx[cardIdx] || 0) + 1);
    document.getElementById('float-match-total').textContent = m ? String(m.length) : "0";
  }

  function hideFloatingOverlay() {
    if (FLOATING_EL) FLOATING_EL.hidden = true;
  }

  function updateFloatingOverlay(cardIdx) {
    if (!FLOATING_EL) return;
    var matches = cardMatchItems[cardIdx] || [];
    document.getElementById("float-match-current").textContent =
      matches.length ? String((cardMatchIdx[cardIdx] || 0) + 1) : "0";
    document.getElementById("float-match-total").textContent = String(matches.length);
  }

 function applyFilter() {
   var terms = activeTerms();
   var searching = terms.length > 0;
   var hasSelectedCardType = cardTypes.city || cardTypes.country;
   var typeTotal = 0;
   var shown = 0;
    if (COUNT_TYPE) {
      COUNT_TYPE.textContent = cardTypes.country && cardTypes.city
        ? "国家、城市"
        : (cardTypes.country ? "国家" : (cardTypes.city ? "城市" : "未选择类型"));
      COUNT_TYPE.setAttribute("aria-label", cardTypes.country && cardTypes.city
        ? "当前显示国家和城市卡片，点击后只显示国家卡片"
        : (cardTypes.country
          ? "当前只显示国家卡片，点击后只显示城市卡片"
          : "当前只显示城市卡片，点击后显示国家和城市卡片"));
      COUNT_TYPE.title = COUNT_TYPE.getAttribute("aria-label");
    }
    matchedCards = [];
    hideFloatingOverlay();
    if (!searching) {
      cardMatchItems = {};
      cardMatchIdx = {};
    }

    cardData.forEach(function (d) {
      var typeMatch = hasSelectedCardType && !!cardTypes[d.type];
      if (typeMatch) typeTotal++;
      var scopedText = [];
      if (searchScopes.region) scopedText.push(d.country, d.continent);
      if (searchScopes.title) scopedText.push(d.title);
      if (searchScopes.body) scopedText.push(d.attractions.join(" "), d.bodyText);
      var text = scopedText.join(" ").toLowerCase();
      var continentMatch = activeContinent === "all" || d.el.dataset.continent === activeContinent;
      var termMatch = matchesSearch(text);
      // Card type is a hard filter: it applies with or without a search query.
      var match = typeMatch && continentMatch && termMatch;
      d.el.style.display = match ? "" : "none";
      clearWidthReveal(d.el);
      clearTravelBorder();
      d.el.classList.remove(
        "travel-card--expanded",
        "travel-card--body-animating",
        "travel-card--expanding",
        "travel-card--collapsing",
        "travel-card--layout-muted",
        "travel-card--layout-moving"
      );
      d.el.querySelector(".travel-card__body").style.removeProperty("max-height");
      d.el.querySelector(".travel-card__body-inner").classList.remove("keep-unclamped");
      d.el.style.removeProperty("transition");
      d.el.style.removeProperty("transform");
      d.el.querySelector(".travel-card__body").style.removeProperty("transition");
      d.el.querySelector(".travel-card__body").style.removeProperty("transform");
      if (currentExpanded === d.el) currentExpanded = null;
      if (!match) {
        d.el.classList.remove("travel-card--searching");
        d.previewEl.hidden = true;
        return;
      }
      shown++;
      if (searching) {
        d.el.classList.add("travel-card--searching");
        var preview = buildPreview(d, terms);
        d.hasHeadingPreview = !!(preview && preview.kind === "heading");
        if (preview) {
          d.previewEl.hidden = false;
          d.previewLabel.textContent = preview.label;
          d.previewIndex.textContent = "";
          d.previewText.innerHTML = preview.html;
          d.previewPrev.disabled = true;
          d.previewNext.disabled = true;
        } else { d.previewEl.hidden = true; }
        matchedCards.push(d);
      } else {
        d.hasHeadingPreview = false;
        d.el.classList.remove("travel-card--searching");
        d.previewEl.hidden = true;
      }
    });

    layoutCardGroups(searching);

    COUNT_TOTAL.textContent = typeTotal;
    COUNT_SHOWN.textContent = shown;
    var existing = GRID_EL.querySelector(".travel-empty");
    if (shown === 0 && cardData.length > 0) {
      if (!existing) { existing = document.createElement("p"); existing.className = "travel-empty empty-state"; GRID_EL.appendChild(existing); }
      existing.innerHTML = '<div class="empty-state__icon">∅</div><p>没有匹配的旅迹。换个关键词试试。</p>';
    } else if (existing) { existing.remove(); }

    if (searching) {
      collectCardMatches();
      cardData.forEach(function (d, idx) {
        if (cardMatchItems[idx] && !d.hasHeadingPreview) updateCardMatchPreview(idx);
      });
    }
  }

  function layoutCardGroups(searching) {
    GROUP_TITLE_ELS.forEach(function (title) { title.remove(); });
    GROUP_TITLE_ELS = [];
    var visibleCities = cardData.filter(function (d) {
      return d.type === "city" && d.el.style.display !== "none";
    });
    var visibleCountries = cardData.filter(function (d) {
      return d.type === "country" && d.el.style.display !== "none";
    });
    var directCountries = searching ? visibleCountries.filter(function (d) {
      var directText = [];
      if (searchScopes.title) directText.push(d.title);
      if (searchScopes.region) directText.push(d.country);
      return directText.length && matchesSearch(directText.join(" ").toLowerCase());
    }) : [];
    var directCities = searching && searchScopes.title ? visibleCities.filter(function (d) {
      return matchesSearch(d.title.toLowerCase());
    }) : [];
    var otherCities = visibleCities.filter(function (d) {
      return directCities.indexOf(d) === -1;
    });
    var otherCountries = visibleCountries.filter(function (d) {
      return directCountries.indexOf(d) === -1;
    });
    function appendTitle(label) {
      var title = document.createElement("h2");
      title.className = "travel-grid__group-title";
      title.textContent = label;
      GROUP_TITLE_ELS.push(title);
      GRID_EL.appendChild(title);
    }
    if (searching) {
      if (directCountries.length) appendTitle("直接命中：国家");
      directCountries.forEach(function (d) { GRID_EL.appendChild(d.el); });
      if (directCities.length) appendTitle("直接命中：城市");
      directCities.forEach(function (d) { GRID_EL.appendChild(d.el); });
      if (otherCities.length) appendTitle("其他命中：城市");
      otherCities.forEach(function (d) { GRID_EL.appendChild(d.el); });
      if (otherCountries.length) appendTitle("其他命中：国家");
      otherCountries.forEach(function (d) { GRID_EL.appendChild(d.el); });
    } else {
      visibleCities.forEach(function (d) { GRID_EL.appendChild(d.el); });
      if (visibleCities.length && visibleCountries.length) appendTitle("国家");
      visibleCountries.forEach(function (d) { GRID_EL.appendChild(d.el); });
    }
    cardData.forEach(function (d) {
      if (d.el.style.display === "none") GRID_EL.appendChild(d.el);
    });
  }

  function removeChipAt(idx) {
    if (removingChip || idx < 0 || idx >= chips.length) return;
    removingChip = true;
    var chipEl = CHIPS_EL.querySelector('[data-chip-index="' + idx + '"]');
    var opIndex = idx === 0 ? 0 : idx - 1;
    var opEl = CHIPS_EL.querySelector('[data-op-index="' + opIndex + '"]');
    if (chipEl) chipEl.classList.add("chip--removing");

    setTimeout(function () {
      if (opEl) opEl.classList.add("chip-op--removing");
    }, 140);
    setTimeout(function () {
      chips.splice(idx, 1);
      if (idx === 0) chipOps.shift();
      else chipOps.splice(idx - 1, 1);
      if (idx < insertionIndex) insertionIndex--;
      insertionIndex = Math.max(0, Math.min(insertionIndex, chips.length));
      removingChip = false;
      renderChips();
      applyFilter();
    }, 240);
  }

  function renderChips(animateChips) {
    var searchEl = CHIPS_EL.parentNode;
    var keepFocus = document.activeElement === INPUT_EL;
    searchEl.appendChild(INPUT_EL);
    CHIPS_EL.innerHTML = "";

    function appendCaret(position) {
      if (position === insertionIndex) {
        CHIPS_EL.appendChild(INPUT_EL);
        return;
      }
      var slot = document.createElement("button");
      slot.type = "button";
      slot.className = "chip-caret-slot";
      slot.setAttribute("aria-label", "在第 " + position + " 个位置输入搜索词");
      slot.addEventListener("click", function () {
        insertionIndex = position;
        renderChips(false);
        INPUT_EL.focus();
      });
      CHIPS_EL.appendChild(slot);
    }

    appendCaret(0);
    chips.forEach(function (term, idx) {
      var chipEl = document.createElement("span");
      chipEl.className = animateChips === false ? "chip chip--static" : "chip";
      chipEl.dataset.chipIndex = String(idx);
      var termEl = document.createElement("button");
      termEl.type = "button";
      termEl.className = "chip__term";
      termEl.textContent = term;
      termEl.title = "点击原位编辑";
      chipEl.appendChild(termEl);

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "chip__remove";
      removeBtn.setAttribute("aria-label", "删除词条 " + term);
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
        edit.setAttribute("aria-label", "编辑搜索词条");
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

      appendCaret(idx + 1);
      if (idx < chips.length - 1) {
        var opIndex = idx;
        var op = document.createElement("button");
        op.type = "button";
        op.className = "chip-op chip-op--" + (chipOps[opIndex] || "and");
        op.textContent = (chipOps[opIndex] || "and").toUpperCase();
        op.title = "点击切换 AND / OR";
        op.setAttribute("aria-label", "切换词条连接方式");
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
    INPUT_EL.classList.toggle("travel-search__input--inline", insertionIndex < chips.length);
    INPUT_EL.setAttribute("placeholder", insertionIndex < chips.length ? "" : SEARCH_PLACEHOLDER);
    INPUT_EL.style.width = insertionIndex < chips.length
      ? Math.max(2, INPUT_EL.value.length + 1) + "ch"
      : "";
    if (insertionIndex < chips.length && !INPUT_EL.value) {
      var fixedPlaceholder = document.createElement("button");
      fixedPlaceholder.type = "button";
      fixedPlaceholder.className = "travel-search__fixed-placeholder";
      fixedPlaceholder.textContent = SEARCH_PLACEHOLDER;
      fixedPlaceholder.setAttribute("aria-label", "移动到搜索栏末尾");
      fixedPlaceholder.addEventListener("click", function () {
        insertionIndex = chips.length;
        renderChips(false);
        INPUT_EL.focus();
      });
      CHIPS_EL.appendChild(fixedPlaceholder);
    }
    if (keepFocus) INPUT_EL.focus();
  }

  INPUT_EL.addEventListener("input", function () {
    if (insertionIndex < chips.length) {
      INPUT_EL.style.width = Math.max(2, INPUT_EL.value.length + 1) + "ch";
    }
    applyFilter();
  });
  if (SEARCH_EL) {
    SEARCH_EL.addEventListener("click", function (e) {
      if (e.target !== SEARCH_EL && e.target !== CHIPS_EL) return;
      insertionIndex = chips.length;
      renderChips(false);
      INPUT_EL.focus();
    });
  }
  if (FILTERS_EL) {
    FILTERS_EL.addEventListener("click", function (e) {
      var chip = e.target.closest(".travel-filters__chip");
      if (!chip) return;
      FILTERS_EL.querySelectorAll(".travel-filters__chip").forEach(function (c) { c.classList.toggle("is-active", c === chip); });
      activeContinent = chip.dataset.continent;
      updateScopeLabel();
      applyFilter();
    });
  }
  function updateScopeLabel() {
    var names = [];
    if (searchScopes.region) names.push("地区");
    if (searchScopes.title) names.push("卡片标题");
    if (searchScopes.body) names.push("正文");
    var typeNames = [];
    if (cardTypes.city) typeNames.push("城市卡片");
    if (cardTypes.country) typeNames.push("国家卡片");
    var scopeText = names.length === 3 ? "" : (names.length ? names.join(" ") : "无搜索范围");
    if (typeNames.length !== 2) scopeText += (scopeText ? " · " : "") + (typeNames.length ? typeNames.join(" ") : "无卡片");
    var continentText = activeContinent === "all" ? "" : activeContinent;
    SCOPE_LABEL.innerHTML = "";
    if (!continentText && !scopeText) {
      SCOPE_LABEL.textContent = "全部";
      return;
    }
    if (continentText) {
      var continentLabel = document.createElement("span");
      continentLabel.textContent = continentText;
      SCOPE_LABEL.appendChild(continentLabel);
    }
    if (continentText && scopeText) {
      var divider = document.createElement("i");
      divider.className = "travel-search-scope__divider";
      divider.setAttribute("aria-hidden", "true");
      SCOPE_LABEL.appendChild(divider);
    }
    if (scopeText) {
      var scopeLabel = document.createElement("span");
      scopeLabel.textContent = scopeText;
      SCOPE_LABEL.appendChild(scopeLabel);
    }
  }
  function setSearchScopes(scopes) {
    searchScopes.region = scopes.indexOf("region") !== -1;
    searchScopes.title = scopes.indexOf("title") !== -1;
    searchScopes.body = scopes.indexOf("body") !== -1;
    if (SCOPE_EL) {
      SCOPE_EL.querySelectorAll('input[data-search-scope]').forEach(function (input) {
        input.checked = !!searchScopes[input.value];
      });
      updateScopeLabel();
    }
    applyFilter();
  }
  function getSearchScopes() {
    return Object.keys(searchScopes).filter(function (scope) {
      return searchScopes[scope];
    });
  }
  function setCardTypes(types) {
    cardTypes.city = types.indexOf("city") !== -1;
    cardTypes.country = types.indexOf("country") !== -1;
    SCOPE_EL.querySelectorAll('input[data-card-type]').forEach(function (input) {
      input.checked = !!cardTypes[input.value];
    });
    updateScopeLabel();
    applyFilter();
  }
  if (COUNT_TYPE) {
    COUNT_TYPE.addEventListener("click", function () {
      if (cardTypes.country && cardTypes.city) {
        setCardTypes(["country"]);
      } else if (cardTypes.country) {
        setCardTypes(["city"]);
      } else {
        setCardTypes(["country", "city"]);
      }
    });
  }
  if (SCOPE_EL) {
    SCOPE_EL.addEventListener("change", function (e) {
      if (e.target.matches('input[data-card-type]')) {
        var selectedTypes = Array.prototype.slice.call(
          SCOPE_EL.querySelectorAll('input[data-card-type]:checked')
        ).map(function (input) { return input.value; });
        setCardTypes(selectedTypes);
        return;
      }
      var checked = Array.prototype.slice.call(
        SCOPE_EL.querySelectorAll('input[data-search-scope]:checked')
      ).map(function (input) { return input.value; });
      setSearchScopes(checked);
    });
    SCOPE_EL.addEventListener("click", function (e) {
      var action = e.target.closest("[data-scope-action]");
      if (!action) return;
      setSearchScopes(action.dataset.scopeAction === "all"
        ? ["region", "title", "body"]
        : []);
    });
    document.addEventListener("click", function (e) {
      if (SCOPE_EL.open && !SCOPE_EL.contains(e.target)) SCOPE_EL.open = false;
    });
  }
  INPUT_EL.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
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
      INPUT_EL.value = ""; renderChips(); applyFilter();
    } else if (e.key === "Backspace" && INPUT_EL.value === "" && chips.length > 0) {
      if (insertionIndex > 0) removeChipAt(insertionIndex - 1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && INPUT_EL.value === "" && insertionIndex > 0) {
      insertionIndex--;
      renderChips(false);
      INPUT_EL.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && INPUT_EL.value === "" && insertionIndex < chips.length) {
      insertionIndex++;
      renderChips(false);
      INPUT_EL.focus();
      e.preventDefault();
    }
  });

  // ════════════ 城市详情弹窗 ════════════

  function openModal(card) {
    closeModal();
    var overlay = document.createElement("div");
    overlay.className = "travel-modal-overlay";
    var modal = document.createElement("div");
    modal.className = "travel-modal";
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var closeBtn = document.createElement("button");
    closeBtn.className = "travel-modal__close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closeModal);
    var titleEl = document.createElement("h2");
    titleEl.className = "travel-modal__title";
    titleEl.textContent = card.title;
    var subEl = document.createElement("p");
    subEl.className = "travel-modal__subtitle";
    var provinceText = getCardProvince(card);
    subEl.textContent = (provinceText ? provinceText + " · " + card.country : card.country + " · " + card.continent) + (card.duration ? " · " + card.duration : "");
    var bodyEl = document.createElement("div");
    bodyEl.className = "travel-modal__body prose";
    bodyEl.innerHTML = nodesToHtml(card.bodyNodes);
    modal.appendChild(closeBtn); modal.appendChild(titleEl); modal.appendChild(subEl); modal.appendChild(bodyEl);
    overlay.appendChild(modal);
    overlay.addEventListener("click", closeModal);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onModalEsc);
    requestAnimationFrame(function () { overlay.classList.add("is-open"); });
  }
  function closeModal() {
    var overlay = document.querySelector(".travel-modal-overlay:not(.travel-summary-overlay)");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (!document.querySelector(".travel-modal-overlay")) document.body.style.overflow = "";
      document.removeEventListener("keydown", onModalEsc);
    }, 280);
  }
  function onModalEsc(e) { if (e.key === "Escape") closeModal(); }

  // —— 暴露给 travels-map.js ——
  window.TravelsNS = {
    parseCards: parseCards, getCards: getCards, applyFilter: applyFilter,
    setSearchScopes: setSearchScopes, getSearchScopes: getSearchScopes,
    INPUT_EL: INPUT_EL, GRID_EL: GRID_EL, MAP_EL: MAP_EL
  };

 function init() {
   if (!SOURCE_EL || !GRID_EL) return;
   var cards = getCards();
   syncContinentFilters(cards);
   COUNT_TOTAL.textContent = cards.length;
   renderCards(cards);
   renderChips(false);
   var initialQuery = new URLSearchParams(location.search).get("q");
   if (initialQuery) INPUT_EL.value = initialQuery;
   applyFilter();
 }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
