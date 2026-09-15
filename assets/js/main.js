// 极简交互 —— 仅处理移动端导航的展开/收起
// 设计上保持克制：不引入动画库、不做无意义的滚动监听

(function () {
  "use strict";

  // Prefetch a likely next page only after the visitor shows intent.
  var prefetchedPages = new Set();

  function prefetchPage(anchor) {
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    if (navigator.connection && (navigator.connection.saveData || /(^|-)2g$/.test(navigator.connection.effectiveType))) return;

    var url;
    try { url = new URL(anchor.href, window.location.href); } catch (e) { return; }
    if (url.origin !== window.location.origin || url.protocol.indexOf("http") !== 0) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    url.hash = "";
    if (prefetchedPages.has(url.href)) return;

    prefetchedPages.add(url.href);
    var hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.href = url.href;
    hint.as = "document";
    document.head.appendChild(hint);
  }

  ["pointerover", "touchstart", "focusin"].forEach(function (eventName) {
    document.addEventListener(eventName, function (e) {
      prefetchPage(e.target.closest && e.target.closest("a[href]"));
    }, { passive: true });
  });

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.querySelector(".site-nav__toggle");
    var list = document.querySelector(".site-nav__list");
    if (!toggle || !list) return;

    toggle.addEventListener("click", function () {
      var isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      list.classList.toggle("is-open", !isOpen);
    });

    // 点击导航链接后自动收起
    list.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        toggle.setAttribute("aria-expanded", "false");
        list.classList.remove("is-open");
      });
    });

    // 大屏幕重置
    var mq = window.matchMedia("(min-width: 1101px)");
    mq.addEventListener("change", function (e) {
      if (e.matches) {
        toggle.setAttribute("aria-expanded", "false");
        list.classList.remove("is-open");
      }
    });

    fitFactCards();
  });

  // Web fonts load after DOMContentLoaded — re-measure once they're ready
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitFactCards);
  }
})();

// theme switcher
(function () {
  "use strict";
  var root = document.documentElement;
  var toggle = document.querySelector(".theme-toggle");
  var autoToggle = document.querySelector(".theme-auto");
  if (!toggle || !autoToggle) return;

  function applyTheme(theme) {
    if (theme === "cool") {
      root.dataset.theme = "cool";
    } else {
      delete root.dataset.theme;
    }
    var isCool = theme === "cool";
    toggle.setAttribute("aria-pressed", String(isCool));
    toggle.setAttribute("aria-label", isCool ? "切换为暖纸配色" : "切换为暗色配色");
  }

  var saved = localStorage.getItem("theme");
  var systemPreference = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var followsSystem = !saved;
  var lastManualTheme = saved || localStorage.getItem("theme-manual") ||
    (root.dataset.theme === "cool" ? "cool" : "warm");

  function applyMode(isAuto) {
    followsSystem = isAuto;
    root.dataset.themeMode = isAuto ? "auto" : "manual";
    autoToggle.setAttribute("aria-pressed", String(isAuto));
    autoToggle.setAttribute("aria-label", isAuto ? "取消自动配色" : "启用自动配色");
    autoToggle.title = isAuto ? "正在跟随系统配色" : "启用系统配色";
    toggle.setAttribute("aria-hidden", String(isAuto));
  }

  applyTheme(saved || (systemPreference && systemPreference.matches ? "cool" : "warm"));
  applyMode(followsSystem);

  if (systemPreference) {
    systemPreference.addEventListener("change", function (event) {
      if (followsSystem) applyTheme(event.matches ? "cool" : "warm");
    });
  }

  toggle.addEventListener("click", function () {
    var next = root.dataset.theme === "cool" ? "warm" : "cool";
    localStorage.setItem("theme", next);
    localStorage.setItem("theme-manual", next);
    lastManualTheme = next;
    followsSystem = false;
    applyTheme(next);
  });

  autoToggle.addEventListener("click", function () {
    if (followsSystem) {
      lastManualTheme = localStorage.getItem("theme-manual") || lastManualTheme;
      localStorage.setItem("theme", lastManualTheme);
      applyTheme(lastManualTheme);
      applyMode(false);
    } else {
      lastManualTheme = root.dataset.theme === "cool" ? "cool" : "warm";
      localStorage.setItem("theme-manual", lastManualTheme);
      localStorage.removeItem("theme");
      applyTheme(systemPreference && systemPreference.matches ? "cool" : "warm");
      applyMode(true);
    }
  });
})();

/**
 * 冷知识卡片：正文较长时自动缩小字体，让卡片不至于过高。
 * 纯 CSS 无法测量渲染后的文字行数，所以用 JS 逐步缩放。
 * 直接测量 answer 元素自身高度，而非卡片整体（避免 min-height 干扰）。
 */
function fitFactCards() {
  var cards = document.querySelectorAll(".about-facts__item");
  if (!cards.length) return;

  var MAX_FONT = 18;   // px — 正文字体上限（≈ fs-lg 1.125rem）
  var MIN_FONT = 13;   // px — 缩放下限，低于此不再缩

  cards.forEach(function (card) {
    var answer = card.querySelector(".about-facts__answer");
    if (!answer) return;

    // 计算答案区域的可用高度 = 卡片 min-height − padding − 其他元素 − 间距
    var cardMinH = parseFloat(getComputedStyle(card).minHeight) || 144;
    var padT = parseFloat(getComputedStyle(card).paddingTop);
    var padB = parseFloat(getComputedStyle(card).paddingBottom);
    var rowGap = parseFloat(getComputedStyle(card).rowGap) || 0;

    // 测量非 answer 的兄弟元素总高度
    var siblingsH = 0;
    Array.prototype.forEach.call(card.children, function (child) {
      if (child !== answer) siblingsH += child.offsetHeight;
    });
    var available = cardMinH - padT - padB - siblingsH - rowGap;

    var fontSize = MAX_FONT;
    answer.style.fontSize = fontSize + "px";

    // 逐步缩小直到 answer 自身高度 ≤ 可用高度
    for (var i = 0; i < 14; i++) {
      if (answer.scrollHeight <= available) break;
      fontSize -= 0.5;
      if (fontSize <= MIN_FONT) { fontSize = MIN_FONT; break; }
      answer.style.fontSize = fontSize + "px";
    }
    answer.style.fontSize = fontSize + "px";
  });
}

// 窗口大小变化时重新计算
var fitTimer;
window.addEventListener("resize", function () {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(fitFactCards, 200);
});
