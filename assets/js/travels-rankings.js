// ════════════════════════════════════════════════════════════
//   travels-rankings.js —— 排行榜弹窗（自包含）
//   绑定 #travel-rankings-btn，解析 #travel-rankings-source，
//   构建带竖排标签栏的模态弹窗。不依赖 travels.js 的内部变量。
// ════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var RANKINGS_BTN = document.getElementById("travel-rankings-btn");
  var RANKINGS_SOURCE_EL = document.getElementById("travel-rankings-source");

  // ── 解析排行榜源数据 ────────────────────────────────────────
  // H1 = 排行榜名称（tab）  H2 = 大等级
  // 正文：空格/换行分隔不同等级，= 连接的元素等级相同
  function parseRankingSource(html) {
    var container = document.createElement("div");
    container.innerHTML = html;

    var rankings = [];
    var currentRanking = null;
    var currentTier = null;
    var currentText = "";

    function flushTier() {
      if (currentTier !== null) {
        var normalized = currentText.replace(/\s+/g, " ").trim();
        if (normalized) {
          normalized = normalized.replace(/\s*=\s*/g, "=");
          currentTier.groups = normalized.split(" ").filter(Boolean).map(function (token) {
            return token.split("=").filter(Boolean);
          });
        } else {
          currentTier.groups = [];
        }
        if (currentRanking) currentRanking.tiers.push(currentTier);
      }
      currentTier = null;
      currentText = "";
    }

    function flushRanking() {
      flushTier();
      if (currentRanking) rankings.push(currentRanking);
      currentRanking = null;
    }

    Array.prototype.slice.call(container.childNodes).forEach(function (node) {
      if (node.nodeType === 1 && node.tagName === "H1") {
        flushRanking();
        currentRanking = { name: node.textContent.trim(), tiers: [] };
      } else if (node.nodeType === 1 && node.tagName === "H2") {
        flushTier();
        currentTier = { name: node.textContent.trim(), groups: [] };
      } else {
        var text = node.textContent || "";
        if (text.trim()) currentText += " " + text;
      }
    });
    flushRanking();

    return rankings;
  }

  // ── 渲染单个排行榜的内容 ────────────────────────────────────
  function renderRankingContent(ranking) {
    var wrap = document.createElement("div");
    wrap.className = "travel-rankings__tiers";

    var globalRank = 1;

    ranking.tiers.forEach(function (tier) {
      var tierEl = document.createElement("div");
      tierEl.className = "travel-rankings__tier";
      tierEl.setAttribute("data-tier", tier.name.trim().toUpperCase());

      var badge = document.createElement("div");
      badge.className = "travel-rankings__tier-badge";
      var badgeSpan = document.createElement("span");
      badgeSpan.textContent = tier.name.trim();
      badge.appendChild(badgeSpan);
      tierEl.appendChild(badge);

      var body = document.createElement("div");
      body.className = "travel-rankings__tier-body";
      body.setAttribute("data-watermark", tier.name.trim());

      tier.groups.forEach(function (group, idx) {
        if (idx > 0) {
          var sep = document.createElement("span");
          sep.className = "travel-rankings__rank-sep";
          body.appendChild(sep);
        }

        var groupEl = document.createElement("div");
        groupEl.className = "travel-rankings__rank-group";
        if (group.length > 1) {
          groupEl.classList.add("travel-rankings__rank-group--tied");
        }

        var rankNum = document.createElement("span");
        rankNum.className = "travel-rankings__rank-num";
        rankNum.textContent = globalRank;
        groupEl.appendChild(rankNum);

        var itemsWrap = document.createElement("div");
        itemsWrap.className = "travel-rankings__items";

        group.forEach(function (itemName, itemIdx) {
          if (itemIdx > 0) {
            var tieMark = document.createElement("span");
            tieMark.className = "travel-rankings__tie-mark";
            tieMark.textContent = "=";
            itemsWrap.appendChild(tieMark);
          }
          var item = document.createElement("span");
          item.className = "travel-rankings__item";
          item.textContent = itemName;
          itemsWrap.appendChild(item);
        });

        groupEl.appendChild(itemsWrap);
        body.appendChild(groupEl);

        globalRank += group.length;
      });

      tierEl.appendChild(body);
      wrap.appendChild(tierEl);
    });

    return wrap;
  }

  function openRankingsModal() {
    closeRankingsModal();
    if (!RANKINGS_SOURCE_EL) return;

    var rankings = parseRankingSource(RANKINGS_SOURCE_EL.innerHTML);
    if (!rankings.length) return;

    var overlay = document.createElement("div");
    overlay.className = "travel-modal-overlay travel-rankings-overlay";
    var modal = document.createElement("div");
    modal.className = "travel-modal travel-modal--rankings";
    modal.addEventListener("click", function (e) { e.stopPropagation(); });

    var closeBtn = document.createElement("button");
    closeBtn.className = "travel-modal__close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closeRankingsModal);

    var head = document.createElement("div");
    head.className = "travel-rankings__head";
    var titleEl = document.createElement("h2");
    titleEl.className = "travel-modal__title";
    titleEl.textContent = "排行榜";
    head.appendChild(titleEl);

    var bodyWrap = document.createElement("div");
    bodyWrap.className = "travel-rankings__body";
    var tabs = document.createElement("div");
    tabs.className = "travel-rankings__tabs";
    var content = document.createElement("div");
    content.className = "travel-rankings__content";

    function activateTab(ranking, tabBtn) {
      tabs.querySelectorAll(".travel-rankings__tab").forEach(function (t) {
        t.classList.remove("is-active");
      });
      tabBtn.classList.add("is-active");
      content.innerHTML = "";
      content.appendChild(renderRankingContent(ranking));
      content.scrollTop = 0;
    }

    rankings.forEach(function (ranking, i) {
      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "travel-rankings__tab";
      tab.textContent = ranking.name;
      tab.addEventListener("click", function () { activateTab(ranking, tab); });
      if (tabs.children.length > 0) {
        var divider = document.createElement("div");
        divider.className = "travel-rankings__tab-divider";
        tabs.appendChild(divider);
      }
      tabs.appendChild(tab);
      if (i === 0) activateTab(ranking, tab);
    });

    bodyWrap.appendChild(tabs);
    bodyWrap.appendChild(content);
    modal.appendChild(closeBtn);
    modal.appendChild(head);
    modal.appendChild(bodyWrap);
    overlay.appendChild(modal);
    overlay.addEventListener("click", closeRankingsModal);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onRankingsEsc);
    requestAnimationFrame(function () { overlay.classList.add("is-open"); });
  }

  function closeRankingsModal() {
    var overlay = document.querySelector(".travel-rankings-overlay");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (!document.querySelector(".travel-modal-overlay")) document.body.style.overflow = "";
      document.removeEventListener("keydown", onRankingsEsc);
    }, 280);
  }

  function onRankingsEsc(e) { if (e.key === "Escape") closeRankingsModal(); }

  if (RANKINGS_BTN) RANKINGS_BTN.addEventListener("click", openRankingsModal);
})();
