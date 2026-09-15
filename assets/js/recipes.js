// ════════════════════════════════════════════════════════════
//   recipes.js —— 菜谱页面
//
//   搜索模型：
//   - 输入框里的文字 → 实时筛选（每打一个字都过滤）
//   - 回车 → 当前文字"锁定"成一个 chip，输入框清空
//   - 点击 chip → 它的文字回到输入框，可编辑后再次回车
//   - 退格（输入框为空时）→ 把最后一个 chip 拉回输入框编辑
//   - chip + 当前输入文字 全部命中才算匹配（AND）
//
//   展开：
//   - 一次只展开一张，开新的自动关旧的
//   - 点 header/excerpt 展开；展开后点 body 区域（未选中文字时）收起
//   - 展开时 excerpt 隐藏；卡片在自己原本位置撑高（grid 行高自适应）
// ════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var RECIPE_COLLAPSED_LINES = 3;
  var SOURCE_EL = document.getElementById("recipe-source");
  var GRID_EL = document.getElementById("recipe-grid");
  var INPUT_EL = document.getElementById("recipe-search-input");
  var CHIPS_EL = document.getElementById("recipe-chips");
  var SEARCH_EL = INPUT_EL ? INPUT_EL.closest(".recipe-search") : null;
  var COUNT_TOTAL = document.getElementById("recipe-count-total");
  var COUNT_SHOWN = document.getElementById("recipe-count-shown");
  var SEARCH_PLACEHOLDER = INPUT_EL ? INPUT_EL.getAttribute("placeholder") : "";

  // state checked via classList

  // —— chip 状态 ——
  // chips: ["红烧", "鸡", ...]  —— 已锁定的词条
  var chips = [];
  var chipOps = [];
  var insertionIndex = 0;
  var removingChip = false;

  // 当前生效的所有搜索词 = chips + 输入框里空格分开的词
  function activeTerms() {
    var rawTerms = (INPUT_EL.value || "").trim().split(/\s+/).filter(Boolean);
    var all = chips.concat(rawTerms);
    return all.map(function (t) { return t.toLowerCase(); }).filter(Boolean);
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

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    return '<span class="recipe-card__match-label">' + label + '</span>' +
      '<span class="recipe-card__match-text">' + highlightTerms(escapeHtml(snippet), terms) + '</span>';
  }

  // —— 解析 notebook ——
  function extractSource(nodes) {
    var source = "";
    for (var nodeIndex = 0; nodeIndex < nodes.length && !source; nodeIndex++) {
      var node = nodes[nodeIndex];
      if (node.nodeType !== 1) continue;
      var items = node.matches("li") ? [node] : Array.prototype.slice.call(node.querySelectorAll("li"));
      for (var i = 0; i < items.length; i++) {
        var match = (items[i].textContent || "").trim().match(/^\[From\s+([^\]]+?)\]/i);
        if (!match) continue;
        source = match[1].trim();
        var prefix = (items[i].textContent || "").match(/^\s*\[From\s+[^\]]+?\]\s*/i);
        var walker = document.createTreeWalker(items[i], NodeFilter.SHOW_TEXT);
        var textNode;
        while (prefix && (textNode = walker.nextNode())) {
          if (!textNode.nodeValue.trim()) continue;
          textNode.nodeValue = textNode.nodeValue.replace(prefix[0], "");
          break;
        }

        // Kramdown 会在来源行后没有空行时，把紧随的正文也包进同一个 li。
        // 去掉仅由来源语法产生的列表外壳，但保留 li 中的全部菜谱内容。
        var parent = items[i].parentElement;
        if (parent && parent.matches("ul, ol") && parent.children.length === 1) {
          var contents = Array.prototype.slice.call(items[i].childNodes);
          if (parent === node) {
            // bodyNodes 保存的是顶层节点引用；直接 replaceWith 会让数组继续指向
            // 已被清空的旧列表，导致有来源的食谱正文消失。
            nodes.splice.apply(nodes, [nodeIndex, 1].concat(contents));
          } else {
            var fragment = document.createDocumentFragment();
            contents.forEach(function (child) { fragment.appendChild(child); });
            parent.replaceWith(fragment);
          }
        } else if (!(items[i].textContent || "").trim()) {
          items[i].remove();
        }
        break;
      }
    }
    return source;
  }

  function parseCards(html) {
    var container = document.createElement("div");
    container.innerHTML = html;
    var cards = [];
    var current = null;
    for (var i = 0; i < container.childNodes.length; i++) {
      var node = container.childNodes[i];
      if (node.nodeType === 1 && node.tagName === "H1") {
        if (current) cards.push(current);
        current = { title: node.textContent.trim(), bodyNodes: [] };
      } else if (current) {
        current.bodyNodes.push(node);
      }
    }
    if (current) cards.push(current);
    cards.forEach(function (card) {
      card.source = extractSource(card.bodyNodes);
    });
    return cards;
  }

  function bodyToHtml(nodes) {
    var d = document.createElement("div");
    nodes.forEach(function (n) { d.appendChild(n.cloneNode(true)); });
    return d.innerHTML;
  }
  function bodyToText(nodes) {
    var d = document.createElement("div");
    nodes.forEach(function (n) { d.appendChild(n.cloneNode(true)); });
    return (d.textContent || "").trim();
  }

  // —— 渲染卡片 ——
  function renderCards(cards) {
    GRID_EL.innerHTML = "";
    cards.forEach(function (card, i) {
      var article = document.createElement("article");
      article.className = "recipe-card";
      article.dataset.index = String(i);

      var bodyText = bodyToText(card.bodyNodes);
      article.dataset.searchText = (card.title + " " + (card.source || "") + " " + bodyText).toLowerCase();

      // header（标题 + 右上角放大按钮）
      var header = document.createElement("header");
      header.className = "recipe-card__header";
      var heading = document.createElement("div");
      heading.className = "recipe-card__heading";
      var title = document.createElement("h3");
      title.className = "recipe-card__title";
      title.textContent = card.title;
      heading.appendChild(title);
      if (card.source) {
        var source = document.createElement("div");
        source.className = "recipe-card__source";
        source.textContent = "来自 " + card.source;
        heading.appendChild(source);
      }
      header.appendChild(heading);

      // 右上角"放大"按钮 —— 点击打开模态弹窗，不触发展开/收起
      var expandBtn = document.createElement("button");
      expandBtn.className = "recipe-card__expand-btn";
      expandBtn.type = "button";
      expandBtn.setAttribute("aria-label", "放大查看");
      expandBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="15 3 21 3 21 9"/>' +
        '<polyline points="9 21 3 21 3 15"/>' +
        '<line x1="21" y1="3" x2="14" y2="10"/>' +
        '<line x1="3" y1="21" x2="10" y2="14"/>' +
        "</svg>";
      function handleExpandButtonClick(e) {
        e.stopImmediatePropagation();
        e.preventDefault();
        openModal(card);
      }
      expandBtn.addEventListener("click", handleExpandButtonClick, true);
      header.appendChild(expandBtn);

      // body（外层）+ body-inner（内层，line-clamp 在这一层）
      // 拆两层是为了避免 padding + border-box 跟 line-clamp 冲突
      var body = document.createElement("div");
      body.className = "recipe-card__body";
      article.setAttribute("role", "button");
      article.setAttribute("tabindex", "0");
      body.setAttribute("aria-expanded", "false");
      var bodyWrap = document.createElement("div");
      bodyWrap.className = "recipe-card__body-wrap";
      var inner = document.createElement("div");
      inner.className = "recipe-card__body-inner prose";
      inner.innerHTML = bodyToHtml(card.bodyNodes);
      bodyWrap.appendChild(inner);
      body.appendChild(bodyWrap);

      var matchEl = document.createElement("div");
      matchEl.className = "recipe-card__match";
      matchEl.setAttribute("hidden", "");

      article.appendChild(header);
      article.appendChild(body);
      article.appendChild(matchEl);
      GRID_EL.appendChild(article);
      syncCollapsedHeight(bodyWrap, inner);
      updateTruncationState(bodyWrap, inner);

      function expand() {

        // 展开不能让短食谱反而变矮：记录展开前真实可见的折叠高度，
        // 将它作为展开高度的下限。
        var collapsedHeight = bodyWrap.clientHeight;
        var measured = measureExpanded(bodyWrap, inner);

        // 加 expanded class（触发 CSS 过渡），同时用 inline 把 max-height
        // 精确设到目标高度，让过渡完美贴合内容自然高度，没有空转
        inner.classList.add("keep-unclamped"); // 动画中不 clamp
        article.classList.add("recipe-card--expanded");
        body.setAttribute("aria-expanded", "true");

        // Find tallest expanded card in this row
        var rowPeers = getRowPeers(article);
        var maxHeight = Math.max(measured.height, collapsedHeight);
        rowPeers.forEach(function (peer) {
          if (!peer.classList.contains("recipe-card--expanded")) return;
          var pWrap = peer.querySelector(".recipe-card__body-wrap");
          var pInner = peer.querySelector(".recipe-card__body-inner");
          if (pWrap && pInner) {
            var pMeasured = measureExpanded(pWrap, pInner);
            if (pMeasured.height > maxHeight) maxHeight = pMeasured.height;
          }
        });
        bodyWrap.style.maxHeight = maxHeight + "px";

        rowPeers.forEach(function (peer) {
          if (peer.classList.contains("recipe-card--expanded")) {
            var pWrap = peer.querySelector(".recipe-card__body-wrap");
            if (pWrap) pWrap.style.maxHeight = maxHeight + "px";
            return;
          }
          var peerBody = peer.querySelector(".recipe-card__body");
          var peerWrap = peer.querySelector(".recipe-card__body-wrap");
          var peerInner = peer.querySelector(".recipe-card__body-inner");
          if (!peerWrap || !peerInner) return;
          setPeerLinesForHeight(peerWrap, peerInner, maxHeight);
          peerInner.classList.add("keep-unclamped");
          peer.classList.add("recipe-card--peer-expanded");
          peerBody.setAttribute("aria-expanded", "false");
          peerWrap.style.maxHeight = maxHeight + "px";
          attachTransitionEnd(peerWrap, "max-height", function () {
            if (peerInner) peerInner.classList.remove("keep-unclamped");
            updateTruncationState(peerWrap, peerInner);
          });
        });      }
      function toggle() {
        if (article.classList.contains("recipe-card--expanded")) {
          collapseCard(article);
        } else if (article.classList.contains("recipe-card--peer-expanded")) {
          promotePeer(article);
        } else {
          expand();
        }
      }

      header.addEventListener("click", toggle);

      // 点 body → 切换（避开文字选择和链接点击）
      article.addEventListener("click", function (e) {
        if (window.getSelection().toString().length > 0) return;
        if (e.target.closest("a")) return;
        toggle();
      });
      body.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggle();
      });

    });
  }

  // —— 测量某个 body 在"完全展开"（fs-base, line-height 1.8）状态下的
  //    自然高度（px）和行数。用 clone 来测，不影响原元素 ——
    function measureExpanded(wrap, inner) {
    var rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize);
    var clone = wrap.cloneNode(true);
    var cloneInner = clone.querySelector(".recipe-card__body-inner");
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
    var cloneInner = clone.querySelector(".recipe-card__body-inner");
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


  function syncCollapsedHeight(wrap, inner) {
    if (!wrap || !inner) return;
    wrap.style.setProperty("--recipe-collapsed-max-height", measureClampedHeight(wrap, inner, RECIPE_COLLAPSED_LINES) + "px");
    wrap.style.setProperty("--recipe-collapsed-height", wrap.clientHeight + "px");
  }

    function fittingLinesForHeight(wrap, inner, height) {
    if (!wrap || !inner) return RECIPE_COLLAPSED_LINES;
    var expanded = measureExpanded(wrap, inner);
    var maxLines = Math.max(RECIPE_COLLAPSED_LINES, expanded.lines + 2);
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


  function updateTruncationState(body, inner) {
    if (!body || !inner) return;
    body.classList.toggle("is-truncated", inner.scrollHeight - body.clientHeight > 1);
  }

  // —— 在某元素上监听一次指定属性的 transitionend，触发后移除监听 ——
  //    带 setTimeout 兜底（万一 transitionend 没触发）
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
    setTimeout(finish, 600); // 比过渡时间（0.4s）多 0.2s 作为兜底
  }

  // —— 清除所有展开状态（平滑收起）——
  function clearExpansionState() {
    var allCards = document.querySelectorAll(".recipe-card--expanded, .recipe-card--peer-expanded");
    allCards.forEach(function (card) {
      var body = card.querySelector(".recipe-card__body");
      var bodyWrap = card.querySelector(".recipe-card__body-wrap");
      var inner = card.querySelector(".recipe-card__body-inner");
      var isExpanded = card.classList.contains("recipe-card--expanded");
      if (inner) inner.classList.add("keep-unclamped");
      if (bodyWrap) {
        bodyWrap.style.maxHeight = measureClampedHeight(bodyWrap, inner, RECIPE_COLLAPSED_LINES) + "px";
        attachTransitionEnd(bodyWrap, "max-height", function () {
          if (inner) {
            inner.classList.remove("keep-unclamped");
            if (!isExpanded) inner.style.removeProperty("--peer-lines");
          }
          bodyWrap.style.maxHeight = "";
          updateTruncationState(bodyWrap, inner);
        });
      }
      if (isExpanded) {
        card.classList.remove("recipe-card--expanded");
        if (body) body.setAttribute("aria-expanded", "false");
      } else {
        card.classList.remove("recipe-card--peer-expanded");
      }
    });
  }
  
  function promotePeer(peerCard) {
    var peerBody = peerCard.querySelector(".recipe-card__body");
    var peerWrap = peerCard.querySelector(".recipe-card__body-wrap");
    var peerInner = peerCard.querySelector(".recipe-card__body-inner");

    peerCard.classList.remove("recipe-card--peer-expanded");
    peerCard.classList.add("recipe-card--expanded");
    if (peerBody) peerBody.setAttribute("aria-expanded", "true");

    var measured = measureExpanded(peerWrap, peerInner);
    var rowPeers = getRowPeers(peerCard);
    var maxHeight = measured.height;
    [peerCard].concat(rowPeers).forEach(function (c) {
      if (!c.classList.contains("recipe-card--expanded")) return;
      var cWrap = c.querySelector(".recipe-card__body-wrap");
      var cInner = c.querySelector(".recipe-card__body-inner");
      if (cWrap && cInner) {
        var cMeasured = measureExpanded(cWrap, cInner);
        if (cMeasured.height > maxHeight) maxHeight = cMeasured.height;
      }
    });

    [peerCard].concat(rowPeers).forEach(function (c) {
     var cWrap = c.querySelector(".recipe-card__body-wrap");
      if (c.classList.contains("recipe-card--peer-expanded")) {
        var cInner = c.querySelector(".recipe-card__body-inner");
        var cWrap = c.querySelector(".recipe-card__body-wrap");
        if (cInner && cWrap) {
          var curH = parseFloat(cWrap.style.maxHeight) || cWrap.scrollHeight;
          setPeerLinesForHeight(cWrap, cInner, maxHeight);
          animateHeight(cWrap, curH, maxHeight, 400, function () {
            updateTruncationState(cWrap, cInner);
          });
        }
      } else {
        var cWrap = c.querySelector(".recipe-card__body-wrap");
        if (cWrap) cWrap.style.maxHeight = maxHeight + "px";
      }
    });
  }

  function collapseCard(activeCard) {
    var activeWrap = activeCard.querySelector(".recipe-card__body-wrap");
    var activeInner = activeCard.querySelector(".recipe-card__body-inner");
    var activeBody = activeCard.querySelector(".recipe-card__body");
    var rowPeers = getRowPeers(activeCard);

    var othersExpanded = rowPeers.filter(function (p) {
      return p.classList.contains("recipe-card--expanded");
    });

    if (othersExpanded.length > 0) {
      // Collapse this card, row at tallest remaining
      var maxHeight = 0;
      othersExpanded.forEach(function (peer) {
        var pWrap = peer.querySelector(".recipe-card__body-wrap");
        var pInner = peer.querySelector(".recipe-card__body-inner");
        if (pWrap && pInner) {
          var pMeasured = measureExpanded(pWrap, pInner);
          if (pMeasured.height > maxHeight) maxHeight = pMeasured.height;
        }
      });

     activeInner.classList.add("keep-unclamped");

      othersExpanded.forEach(function (peer) {
        var pWrap = peer.querySelector(".recipe-card__body-wrap");
        if (pWrap) pWrap.style.maxHeight = maxHeight + "px";
      });
      rowPeers.forEach(function (peer) {
        if (peer === activeCard || peer.classList.contains("recipe-card--expanded")) return;
        var pWrap = peer.querySelector(".recipe-card__body-wrap");
        var pInner = peer.querySelector(".recipe-card__body-inner");
        animatePeerToHeight(pWrap, pInner, maxHeight);
      });

      var currentHeight = parseFloat(activeWrap.style.maxHeight);
      if (currentHeight && Math.abs(currentHeight - maxHeight) > 1) {
        // Row height changes - animate smoothly
        animateHeight(activeWrap, currentHeight, maxHeight, 400, function () {
          activeCard.classList.remove("recipe-card--expanded");
          activeCard.classList.add("recipe-card--peer-expanded");
          setPeerLinesForHeight(activeWrap, activeInner, maxHeight);
          if (activeBody) activeBody.setAttribute("aria-expanded", "false");
          activeInner.classList.remove("keep-unclamped");
          activeWrap.style.maxHeight = maxHeight + "px";
          updateTruncationState(activeWrap, activeInner);
        });
      } else {
        // Row height unchanged - apply immediately
        activeCard.classList.remove("recipe-card--expanded");
        activeCard.classList.add("recipe-card--peer-expanded");
        setPeerLinesForHeight(activeWrap, activeInner, maxHeight);
        if (activeBody) activeBody.setAttribute("aria-expanded", "false");
        activeInner.classList.remove("keep-unclamped");
        activeWrap.style.maxHeight = maxHeight + "px";
        updateTruncationState(activeWrap, activeInner);
      }
    } else {
      // No other expanded cards -> collapse entire row
      var collapsedHeight = measureClampedHeight(activeWrap, activeInner, RECIPE_COLLAPSED_LINES);
      activeInner.classList.add("keep-unclamped");
      activeWrap.style.maxHeight = collapsedHeight + "px";
      activeCard.classList.remove("recipe-card--expanded");
      if (activeBody) activeBody.setAttribute("aria-expanded", "false");

      rowPeers.forEach(function (peer) {
        var peerWrap = peer.querySelector(".recipe-card__body-wrap");
        var peerInner = peer.querySelector(".recipe-card__body-inner");
        if (peerInner) peerInner.classList.add("keep-unclamped");
        if (peerWrap) {
          peerWrap.style.maxHeight = measureClampedHeight(peerWrap, peerInner, RECIPE_COLLAPSED_LINES) + "px";
          attachTransitionEnd(peerWrap, "max-height", function () {
            if (peerInner) {
              peerInner.classList.remove("keep-unclamped");
              peerInner.style.removeProperty("--peer-lines");
            }
            peerWrap.style.maxHeight = "";
            updateTruncationState(peerWrap, peerInner);
          });
        }
        peer.classList.remove("recipe-card--peer-expanded");
      });
      attachTransitionEnd(activeWrap, "max-height", function () {
        activeInner.classList.remove("keep-unclamped");
        activeWrap.style.maxHeight = "";
        updateTruncationState(activeWrap, activeInner);
      });
    }
  }
  // —— 找出同一行的卡片（用于展开时让同行一起撑高）——
  function getRowPeers(card) {
    var top = card.offsetTop;
    return Array.prototype.slice
      .call(GRID_EL.querySelectorAll(".recipe-card"))
      .filter(function (c) {
        return (
          c !== card &&
          c.style.display !== "none" &&
          Math.abs(c.offsetTop - top) <= 2
        );
      });
  }

  // —— 筛选 ——
  function applyFilter() {
    var terms = activeTerms();
    var cardEls = GRID_EL.querySelectorAll(".recipe-card");
    var total = cardEls.length;
    var shown = 0;

    cardEls.forEach(function (card) {
      var text = card.dataset.searchText || "";
      var match = matchesSearch(text);
      var matchEl = card.querySelector(".recipe-card__match");
      card.style.display = match ? "" : "none";
      if (match) {
        shown++;
        if (terms.length && matchEl) {
          var title = card.querySelector(".recipe-card__title");
          var body = card.querySelector(".recipe-card__body-inner");
          var preview = buildMatchPreview("标题", title ? title.textContent : "", terms) ||
            buildMatchPreview("正文", body ? body.textContent.replace(/\s+/g, " ").trim() : "", terms);
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

    var existing = GRID_EL.querySelector(".recipe-empty");
    if (shown === 0 && total > 0) {
      if (!existing) {
        existing = document.createElement("div");
        existing.className = "recipe-empty empty-state";
        GRID_EL.appendChild(existing);
      }
      existing.innerHTML =
        '<div class="empty-state__icon">∅</div><p>没有匹配的菜谱。换个关键词，或点击某个词条回到输入框编辑。</p>';
    } else if (existing) {
      existing.remove();
    }
  }

  // —— chip 渲染 ——
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

      // 点击 chip → 它的内容回到输入框编辑，从 chip 列表移除
      function editChip() {
        INPUT_EL.value = term;
        chips.splice(idx, 1);
        renderChips();
        applyFilter();
        INPUT_EL.focus();
        // 把光标放到末尾
        var len = INPUT_EL.value.length;
        try { INPUT_EL.setSelectionRange(len, len); } catch (e) {}
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

  // —— 输入框事件 ——
  // 实时搜索：每次按键都过滤
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
    INPUT_EL.classList.toggle("recipe-search__input--inline", insertionIndex < chips.length);
    INPUT_EL.setAttribute("placeholder", insertionIndex < chips.length ? "" : SEARCH_PLACEHOLDER);
    INPUT_EL.style.width = insertionIndex < chips.length
      ? Math.max(2, INPUT_EL.value.length + 1) + "ch"
      : "";
    if (insertionIndex < chips.length && !INPUT_EL.value) {
      var fixedPlaceholder = document.createElement("button");
      fixedPlaceholder.type = "button";
      fixedPlaceholder.className = "recipe-search__fixed-placeholder";
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

  // —— 模态弹窗 ——
  function openModal(card) {
    // 如果已有弹窗，先关掉
    closeModal();

    var overlay = document.createElement("div");
    overlay.className = "recipe-modal-overlay";

    var modal = document.createElement("div");
    modal.className = "recipe-modal";
    modal.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
    });
    modal.addEventListener("click", function (e) {
      e.stopPropagation(); // 点弹窗内部不关闭
    });

    var closeBtn = document.createElement("button");
    closeBtn.className = "recipe-modal__close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closeModal);

    var titleEl = document.createElement("h2");
    titleEl.className = "recipe-modal__title";
    titleEl.textContent = card.title;

    var bodyEl = document.createElement("div");
    bodyEl.className = "recipe-modal__body prose";
    bodyEl.innerHTML = bodyToHtml(card.bodyNodes);

    modal.appendChild(closeBtn);
    modal.appendChild(titleEl);
    modal.appendChild(bodyEl);
    overlay.appendChild(modal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });

    // 点灰幕关闭
    overlay.addEventListener("click", closeModal);

    document.body.appendChild(overlay);
    document.body.dataset.recipeModalOverflow = document.body.style.overflow || "";
    document.body.dataset.recipeModalPaddingRight = document.body.style.paddingRight || "";
    var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) document.body.style.paddingRight = scrollbarWidth + "px";
    document.addEventListener("keydown", onModalEsc);
    document.body.style.overflow = "hidden"; // 锁背景滚动
    document.addEventListener("keydown", onModalEsc);

    // 下一帧触发淡入动画
    requestAnimationFrame(function () {
      overlay.classList.add("is-open");
    });
  }

  function closeModal() {
    var overlay = document.querySelector(".recipe-modal-overlay");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.body.style.overflow = document.body.dataset.recipeModalOverflow || "";
      document.body.style.paddingRight = document.body.dataset.recipeModalPaddingRight || "";
      delete document.body.dataset.recipeModalOverflow;
      delete document.body.dataset.recipeModalPaddingRight;
      document.removeEventListener("keydown", onModalEsc);
    }, 280);
  }

  function onModalEsc(e) {
    if (e.key === "Escape") closeModal();
  }

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

  // 回车 → 锁定为 chip；退格（空输入时）→ 拉回最后一个 chip 编辑
  INPUT_EL.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var value = INPUT_EL.value.trim();
      if (!value) return;
      // 避免重复
      if (chips.indexOf(value) === -1) chips.push(value);
      INPUT_EL.value = "";
      renderChips();
      applyFilter();
    } else if (e.key === "Backspace" && INPUT_EL.value === "" && chips.length > 0) {
      // 拉回最后一个 chip 编辑
      INPUT_EL.value = chips.pop();
      renderChips();
      applyFilter();
      // 光标放到开头，让用户从前面编辑
      try { INPUT_EL.setSelectionRange(0, 0); } catch (e2) {}
      e.preventDefault();
    }
  });

  // —— 初始化 ——
  function init() {
    if (!SOURCE_EL || !GRID_EL) return;
    var cards = parseCards(SOURCE_EL.innerHTML);
    COUNT_TOTAL.textContent = cards.length;
    renderCards(cards);
    renderChips(false);
    applyFilter();
      var pel = document.getElementById("travel-page-loading"); if (pel) pel.classList.add("travel-page-loading--hidden");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
