(function () {
  "use strict";

  var STORAGE = "story-tree-example-v2";
  var STORY_LIKES_STORAGE = "story-tree-liked-stories";
  var NODE_LIKES_STORAGE = "story-tree-liked-nodes";
  var DRAFT_STORAGE = "story-tree-content-drafts-v1";
  var AUTHOR_STORAGE = "blog-comment-name";
  var DEVICE_STORAGE = "story-tree-device-id-v1";
  var LAST_ACTION_STORAGE = "story-tree-last-action-at-v1";
  var LAST_VIEW_STORAGE = "story-tree-last-view-v1";
  var ACTION_COOLDOWN_MS = 4 * 60 * 60 * 1000;
  var root = document.getElementById("story-tree-app");
  if (!root) return;
  if (root.__storyTreeInitialized) return;
  root.__storyTreeInitialized = true;
  var dataRequest = null;
  var dataReady = false;
  var loadingTimer = null;
  var state = { data: null, apiMode: false, story: null, selected: null, readerMode: "node", composerMode: null, treeView: { scale: 1, x: 0, y: 0, dragging: false, pointerId: null, lastX: 0, lastY: 0 } };
  var edgeFrame = null;
  var fitFrame = null;
  var centerFrame = null;
  var activeTooltipDot = null;
  var activeBubbleTooltipCard = null;
  var inputModality = "pointer";
  var tooltipPortal = document.createElement("span");
  tooltipPortal.className = "story-node__tooltip story-node__tooltip--portal";
  tooltipPortal.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltipPortal);
  var bubbleTooltip = document.createElement("div");
  bubbleTooltip.className = "story-bubble-tooltip";
  bubbleTooltip.setAttribute("role", "tooltip");
  bubbleTooltip.setAttribute("aria-hidden", "true");
  bubbleTooltip.innerHTML = '<div class="story-bubble-tooltip__preview" data-bubble-tooltip-preview></div><div class="story-bubble-tooltip__body" data-bubble-tooltip-body></div><p class="story-bubble-tooltip__meta"><strong data-bubble-tooltip-count></strong> 个故事节点</p>';
  document.body.appendChild(bubbleTooltip);
  var $ = function (selector) { return root.querySelector(selector); };
  var esc = function (value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]; }); };
  function markdownInline(value) {
    return esc(value)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function markdownHtml(value) {
    var source = String(value == null ? "" : value).replace(/\r\n?/g, "\n").trim();
    if (!source) return "";
    return source.split(/\n\s*\n/).map(function (block) {
      var lines = block.split("\n");
      var heading = lines.length === 1 && lines[0].match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) return "<h" + heading[1].length + ">" + markdownInline(heading[2]) + "</h" + heading[1].length + ">";
      if (lines.every(function (line) { return /^\s*[-*+]\s+/.test(line); })) return "<ul>" + lines.map(function (line) { return "<li>" + markdownInline(line.replace(/^\s*[-*+]\s+/, "")) + "</li>"; }).join("") + "</ul>";
      if (lines.every(function (line) { return /^\s*>\s?/.test(line); })) return "<blockquote>" + lines.map(function (line) { return markdownInline(line.replace(/^\s*>\s?/, "")); }).join("<br>") + "</blockquote>";
      return "<p>" + lines.map(markdownInline).join("<br>") + "</p>";
    }).join("");
  }
  var text = function (code) { return String.fromCharCode.apply(String, code); };
  var labels = {
    create: text([20174, 36825, 37324, 21019, 20316]),
    edit: text([27573, 33853, 32534, 36753]),
    delete: text([21024, 38500, 33410, 28857]),
    wrongKey: "编辑密码错误",
    requiredKey: "请输入创建该段落时设置的编辑密码"
  };
  function id() { return String(Math.floor(10000 + Math.random() * 900000)); }
  function now() { return new Date().toISOString(); }
  function formatTime(value) { var date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" }); }
  function hashKey(key) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)).then(function (buffer) { return Array.prototype.map.call(new Uint8Array(buffer), function (byte) { return byte.toString(16).padStart(2, "0"); }).join(""); }); }
  function deviceId() {
    try {
      var stored = localStorage.getItem(DEVICE_STORAGE);
      if (stored) return stored;
      var value = crypto.randomUUID ? crypto.randomUUID() : id() + "-" + id() + "-" + Date.now();
      localStorage.setItem(DEVICE_STORAGE, value);
      return value;
    } catch (_) { return ""; }
  }
  function lastActionRequiresKey() {
    try {
      var timestamp = Number(localStorage.getItem(LAST_ACTION_STORAGE));
      return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp < ACTION_COOLDOWN_MS;
    } catch (_) { return false; }
  }
  function rememberStoryAction() {
    try { localStorage.setItem(LAST_ACTION_STORAGE, String(Date.now())); } catch (_) {}
  }
  function editKeyVisibilityIcon(visible) {
    if (visible) return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.1 12a10.8 10.8 0 0 1 19.8 0 10.8 10.8 0 0 1-19.8 0Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 2 20 20"></path><path d="M6.7 6.7A10.8 10.8 0 0 0 2.1 12a10.8 10.8 0 0 0 16.2 5.3"></path><path d="M10.7 4.1A11 11 0 0 1 21.9 12a10.8 10.8 0 0 1-2.1 3.2"></path><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"></path></svg>';
  }
  function decorateEditKeyVisibility(input) {
    if (!input || input.closest(".story-password-field")) return;
    var field = document.createElement("span");
    field.className = "story-password-field";
    input.parentNode.insertBefore(field, input);
    field.appendChild(input);
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "story-password-toggle";
    toggle.setAttribute("data-edit-key-visibility", "");
    toggle.setAttribute("aria-label", "\u663e\u793a\u7f16\u8f91\u5bc6\u7801");
    toggle.setAttribute("aria-pressed", "false");
    toggle.title = "\u663e\u793a\u7f16\u8f91\u5bc6\u7801";
    toggle.innerHTML = editKeyVisibilityIcon(false);
    field.appendChild(toggle);
  }
  function save() { localStorage.setItem(STORAGE, JSON.stringify(state.data)); }
  function storedStoryData() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE) || "null");
      return stored && Array.isArray(stored.stories) ? stored : null;
    } catch (_) {
      return null;
    }
  }
  function drafts() { try { var stored = JSON.parse(localStorage.getItem(DRAFT_STORAGE) || "{}"); return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}; } catch (_) { return {}; } }
  function draftKey(mode) {
    if (mode === "create") return "create";
    if (!state.story || state.selected == null || (mode !== "reply" && mode !== "edit")) return null;
    return mode + ":" + String(state.story.slug || state.story.id) + ":" + String(state.selected);
  }
  function draftContent(mode) {
    var key = draftKey(mode), stored = drafts();
    return key && Object.prototype.hasOwnProperty.call(stored, key) ? String(stored[key]) : null;
  }
  function saveDraftContent(mode, content) {
    var key = draftKey(mode);
    if (!key) return;
    var stored = drafts();
    stored[key] = String(content);
    try { localStorage.setItem(DRAFT_STORAGE, JSON.stringify(stored)); } catch (_) {}
  }
  function draftFieldKey(mode, field) { var base = draftKey(mode); return base ? base + "::" + field : null; }
  function draftField(mode, field) {
    var key = draftFieldKey(mode, field), stored = drafts();
    return key && Object.prototype.hasOwnProperty.call(stored, key) ? String(stored[key]) : null;
  }
  function saveDraftField(mode, field, value) {
    var key = draftFieldKey(mode, field);
    if (!key) return;
    var stored = drafts();
    stored[key] = String(value);
    try { localStorage.setItem(DRAFT_STORAGE, JSON.stringify(stored)); } catch (_) {}
  }
  function clearDraft(key) {
    if (!key) return;
    var stored = drafts();
    if (!Object.prototype.hasOwnProperty.call(stored, key)) return;
    delete stored[key];
    try { localStorage.setItem(DRAFT_STORAGE, JSON.stringify(stored)); } catch (_) {}
  }
  function likedIds(type) { try { return new Set(JSON.parse(localStorage.getItem(type === "story" ? STORY_LIKES_STORAGE : NODE_LIKES_STORAGE) || "[]")); } catch (_) { return new Set(); } }
  function saveLikedIds(type, ids) { try { localStorage.setItem(type === "story" ? STORY_LIKES_STORAGE : NODE_LIKES_STORAGE, JSON.stringify(Array.from(ids))); } catch (_) {} }
  function saveLastView() {
    if (!state.story) return;
    try { localStorage.setItem(LAST_VIEW_STORAGE, JSON.stringify({ slug: state.story.slug || state.story.id, nodeId: state.selected })); } catch (_) {}
  }
  function readLastView() { try { return JSON.parse(localStorage.getItem(LAST_VIEW_STORAGE) || "null"); } catch (_) { return null; } }
  function clearLastView() { try { localStorage.removeItem(LAST_VIEW_STORAGE); } catch (_) {} }
  function likeButton(type, item, itemId, className) { var liked = likedIds(type).has(String(itemId)); return '<button type="button" class="' + className + (liked ? " is-liked" : "") + '" data-like-type="' + type + '" data-like-id="' + esc(itemId) + '" aria-pressed="' + liked + '" aria-label="点赞"><span aria-hidden="true">' + (liked ? "\u2665" : "\u2661") + '</span><span>' + Number(item.likes || 0) + '</span></button>'; }
  function renderStoryLike() { var slot = $("[data-story-like]"); if (slot) slot.innerHTML = state.story ? likeButton("story", state.story, state.story.slug || state.story.id, "story-detail__like") : ""; }
  function nodeLikeIndicator(item, itemId) { var liked = likedIds("node").has(String(itemId)); return '<span class="story-node__like' + (liked ? " is-liked" : "") + '" aria-hidden="true"><span>' + (liked ? "\u2665" : "\u2661") + '</span><span>' + Number(item.likes || 0) + '</span></span>'; }
  function toggleLike(button) {
    var type = button.dataset.likeType, itemId = String(button.dataset.likeId), ids = likedIds(type),
      item = type === "story" ? state.data.stories.find(function (story) { return String(story.slug || story.id) === itemId; }) : state.data.stories.reduce(function (found, story) { return found || story.nodes.find(function (node) { return String(node.fragment_id || node.id) === itemId; }); }, null);
    if (!item) return;
    var wasLiked = ids.has(itemId), nowLiked = !wasLiked;
    if (wasLiked) ids.delete(itemId); else ids.add(itemId);
    item.likes = Math.max(0, Number(item.likes || 0) + (wasLiked ? -1 : 1));
    saveLikedIds(type, ids);
    if (!state.apiMode) save();
    if (type === "story") { renderLibrary(); renderStoryLike(); } else renderDetail();
    if (state.apiMode) {
      apiRequest("/api/story-likes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: type, id: itemId, liked: nowLiked }) }).then(function (data) {
        if (data && typeof data.likes === "number" && data.likes !== item.likes) { item.likes = data.likes; if (type === "story") { renderLibrary(); renderStoryLike(); } else renderDetail(); }
      }).catch(function (error) { console.warn("Story like sync failed", error); });
    }
  }
  function children(node) { return state.story.nodes.filter(function (item) { return item.parent_id === node.id; }); }
  function nodeById(value) { return state.story && state.story.nodes.find(function (item) { return String(item.id) === String(value); }); }
  function snippet(value) { var compact = String(value || "").replace(/\s+/g, " ").trim(); return compact.length > 100 ? compact.slice(0, 99) + "\u2026" : compact; }
  function normalizeIds() {
    var used = new Set();
    state.data.stories.forEach(function (story) { story.nodes.forEach(function (node) { var value = String(node.fragment_id || ""); if (!/^\d{5,6}$/.test(value) || used.has(value)) { do { value = id(); } while (used.has(value)); node.fragment_id = value; } used.add(value); }); });
  }
  function firstNode() { return state.story && (state.story.nodes.find(function (node) { return node.parent_id === null; }) || state.story.nodes[0]); }
  function pathTo(node) { var result = [], current = node; while (current) { result.unshift(current); current = nodeById(current.parent_id); } return result; }
  function renderTreeEdges() {
    var viewport = $("[data-story-tree]");
    if (!viewport || !state.story) return;
    var svg = viewport.querySelector(":scope > .story-tree-edges");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("story-tree-edges");
      svg.setAttribute("aria-hidden", "true");
      viewport.prepend(svg);
    }
    var viewportRect = viewport.getBoundingClientRect();
    svg.setAttribute("viewBox", "0 0 " + viewport.clientWidth + " " + viewport.clientHeight);
    svg.replaceChildren();
    var nodeElements = new Map();
    Array.prototype.forEach.call(viewport.querySelectorAll(".story-node[data-node]"), function (item) {
      nodeElements.set(String(item.dataset.node), item);
    });
    state.story.nodes.forEach(function (node) {
      if (node.parent_id === null) return;
      var childItem = nodeElements.get(String(node.id));
      var parentItem = nodeElements.get(String(node.parent_id));
      if (!childItem || !parentItem) return;
      var childDot = childItem.querySelector(".story-node__dot");
      var parentDot = parentItem.querySelector(".story-node__dot");
      if (!childDot || !parentDot) return;
      var childRect = childDot.getBoundingClientRect();
      var parentRect = parentDot.getBoundingClientRect();
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", parentRect.left + parentRect.width / 2 - viewportRect.left);
      line.setAttribute("y1", parentRect.top + parentRect.height / 2 - viewportRect.top);
      line.setAttribute("x2", childRect.left + childRect.width / 2 - viewportRect.left);
      line.setAttribute("y2", childRect.top + childRect.height / 2 - viewportRect.top);
      svg.appendChild(line);
    });
  }
  function scheduleTreeEdges() {
    if (edgeFrame !== null) return;
    edgeFrame = requestAnimationFrame(function () { edgeFrame = null; renderTreeEdges(); });
  }
  function fitTreeView() {
    stopTreeCentering();
    var viewport = $("[data-story-tree]");
    var canvas = viewport && viewport.querySelector(":scope > .story-tree-root");
    if (!viewport || !canvas) return;
    canvas.style.transform = "none";
    var viewportRect = viewport.getBoundingClientRect();
    var canvasRect = canvas.getBoundingClientRect();
    var padding = 16;
    var availableWidth = Math.max(1, viewport.clientWidth - padding * 2);
    var availableHeight = Math.max(1, viewport.clientHeight - padding * 2);
    var naturalWidth = Math.max(1, canvasRect.width);
    var naturalHeight = Math.max(1, canvasRect.height);
    var requestedScale = Math.min(2, availableWidth / naturalWidth, availableHeight / naturalHeight);
    var scale = Math.max(.55, requestedScale);
    var canvasLeft = canvasRect.left - viewportRect.left;
    var canvasTop = canvasRect.top - viewportRect.top;
    var fitsCompletely = naturalWidth * scale <= availableWidth && naturalHeight * scale <= availableHeight;
    if (fitsCompletely) {
      state.treeView.x = padding + (availableWidth - naturalWidth * scale) / 2 - canvasLeft;
      state.treeView.y = padding + (availableHeight - naturalHeight * scale) / 2 - canvasTop;
    } else {
      var rootNode = firstNode();
      var rootItem = Array.prototype.find.call(canvas.querySelectorAll(".story-node[data-node]"), function (item) {
        return rootNode && String(item.dataset.node) === String(rootNode.id);
      });
      var rootDot = rootItem && rootItem.querySelector(".story-node__dot");
      var rootRect = rootDot ? rootDot.getBoundingClientRect() : canvasRect;
      var rootCenterX = rootRect.left + rootRect.width / 2 - canvasRect.left;
      var rootTop = rootRect.top - canvasRect.top;
      state.treeView.x = viewport.clientWidth / 2 - canvasLeft - rootCenterX * scale;
      state.treeView.y = padding - canvasTop - rootTop * scale;
    }
    state.treeView.scale = scale;
    applyTreeView();
  }
  function scheduleFitTreeView() {
    if (fitFrame !== null) cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(function () { fitFrame = null; fitTreeView(); });
  }
  function applyTreeView() {
    var canvas = $("[data-story-tree] > .story-tree-root");
    if (!canvas) return;
    canvas.style.transform = "translate(" + state.treeView.x + "px, " + state.treeView.y + "px) scale(" + state.treeView.scale + ")";
    scheduleTreeEdges();
  }
  function stopTreeCentering() {
    if (centerFrame === null) return;
    cancelAnimationFrame(centerFrame);
    centerFrame = null;
  }
  function centerTreeNode(item) {
    var viewport = $("[data-story-tree]");
    var dot = item && item.querySelector(".story-node__dot");
    if (!viewport || !dot) return;
    stopTreeCentering();
    var viewportRect = viewport.getBoundingClientRect();
    var dotRect = dot.getBoundingClientRect();
    var startScale = state.treeView.scale || 1;
    var startX = state.treeView.x;
    var startY = state.treeView.y;
    var dotCenterX = dotRect.left - viewportRect.left + dotRect.width / 2;
    var dotCenterY = dotRect.top - viewportRect.top + dotRect.height / 2;
    var dotCanvasX = (dotCenterX - startX) / startScale;
    var dotCanvasY = (dotCenterY - startY) / startScale;
    var targetScale = dotRect.width < 36 ? Math.min(2, startScale / dotRect.width * 36) : startScale;
    var targetX = viewportRect.width / 2 - dotCanvasX * targetScale;
    var targetY = viewportRect.height / 2 - dotCanvasY * targetScale;
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      state.treeView.x = targetX; state.treeView.y = targetY; state.treeView.scale = targetScale;
      applyTreeView();
      return;
    }
    var startedAt = null;
    var duration = 400;
    function move(timestamp) {
      if (startedAt === null) startedAt = timestamp;
      var progress = Math.min(1, (timestamp - startedAt) / duration);
      var eased = progress < .5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      state.treeView.x = startX + (targetX - startX) * eased;
      state.treeView.y = startY + (targetY - startY) * eased;
      state.treeView.scale = startScale + (targetScale - startScale) * eased;
      applyTreeView();
      if (progress < 1) centerFrame = requestAnimationFrame(move);
      else centerFrame = null;
    }
    centerFrame = requestAnimationFrame(move);
  }
  function resetTreeView() { stopTreeCentering(); state.treeView.scale = 1; state.treeView.x = 0; state.treeView.y = 0; state.treeView.dragging = false; applyTreeView(); }
  function syncTreePanePin(forceMeasure) {
    var pane = root.querySelector(".story-tree-pane"), detail = $("[data-story-detail]");
    if (!pane || !detail || detail.hidden || window.matchMedia("(max-width: 760px)").matches) {
      if (pane) { pane.classList.remove("is-viewport-pinned"); pane.style.removeProperty("--tree-pane-left"); pane.style.removeProperty("--tree-pane-width"); delete pane.dataset.pinTop; }
      return;
    }
    if (forceMeasure || !pane.dataset.pinTop) {
      pane.classList.remove("is-viewport-pinned");
      var measured = pane.getBoundingClientRect();
      pane.dataset.pinTop = String(window.scrollY + measured.top);
      pane.style.setProperty("--tree-pane-left", measured.left + "px");
      pane.style.setProperty("--tree-pane-width", measured.width + "px");
    }
    var offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--writing-sticky-offset")) || 104;
    pane.classList.toggle("is-viewport-pinned", window.scrollY + offset >= Number(pane.dataset.pinTop));
  }
  function scrollNodeHeadingIntoView() {
    var heading = $(".story-detail__heading");
    if (!heading || heading.hidden) return;
    var offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--writing-sticky-offset")) || 104;
    var top = Math.max(0, window.scrollY + heading.getBoundingClientRect().top - offset - 12);
    var behavior = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    window.scrollTo({ top: top, behavior: behavior });
  }
  function positionNodeTooltip(clientX, clientY) {
    var left = Math.max(12, Math.min(window.innerWidth - tooltipPortal.offsetWidth - 12, clientX + 14));
    var top = Math.max(12, Math.min(window.innerHeight - tooltipPortal.offsetHeight - 12, clientY + 14));
    tooltipPortal.style.left = left + "px";
    tooltipPortal.style.top = top + "px";
  }
  function showNodeTooltip(dot, clientX, clientY) {
    var source = dot && dot.querySelector(".story-node__tooltip");
    if (!source) return;
    activeTooltipDot = dot;
    tooltipPortal.innerHTML = source.innerHTML;
    tooltipPortal.classList.add("is-visible");
    positionNodeTooltip(clientX, clientY);
  }
  function hideNodeTooltip(dot) {
    if (dot && activeTooltipDot !== dot) return;
    activeTooltipDot = null;
    tooltipPortal.classList.remove("is-visible");
  }
  function positionBubbleTooltip(clientX, clientY) {
    var gap = 14;
    var rect = bubbleTooltip.getBoundingClientRect();
    var left = Math.min(window.innerWidth - rect.width - gap, clientX + gap);
    var top = Math.min(window.innerHeight - rect.height - gap, clientY + gap);
    bubbleTooltip.style.left = Math.max(gap, left) + "px";
    bubbleTooltip.style.top = Math.max(gap, top) + "px";
  }
  function showBubbleTooltip(card, clientX, clientY) {
    activeBubbleTooltipCard = card;
    bubbleTooltip.querySelector("[data-bubble-tooltip-preview]").innerHTML = markdownHtml(card.getAttribute("data-story-preview") || card.querySelector(".story-preview__content").textContent);
    bubbleTooltip.querySelector("[data-bubble-tooltip-body]").innerHTML = markdownHtml(card.getAttribute("data-story-body") || "");
    bubbleTooltip.querySelector("[data-bubble-tooltip-count]").textContent = card.dataset.nodeCount || "0";
    bubbleTooltip.setAttribute("aria-hidden", "false");
    bubbleTooltip.classList.add("is-visible");
    positionBubbleTooltip(clientX, clientY);
  }
  function hideBubbleTooltip(card) {
    if (card && activeBubbleTooltipCard !== card) return;
    activeBubbleTooltipCard = null;
    bubbleTooltip.classList.remove("is-visible");
    bubbleTooltip.setAttribute("aria-hidden", "true");
  }

  function storyCard(story, index) {
    var first = story.nodes.find(function (node) { return node.parent_id === null; }) || story.nodes[0];
    var fallback = first ? String(first.content || "").split(/(?<=[。！？.!?])|\n/)[0].trim() : "";
    var preview = String(story.preview || fallback).trim();
    var nodeCount = Array.isArray(story.nodes) ? story.nodes.length : 0;
    return '<article class="story-preview" data-story-card data-story-index="' + index + '" data-node-count="' + nodeCount + '" data-story-preview="' + esc(preview) + '" data-story-body="' + esc(first ? first.content : "") + '" tabindex="0" role="button" aria-label="' + esc(story.title) + '，' + nodeCount + ' 个节点"><div class="story-preview__inner"><div class="story-preview__content">' + markdownInline(preview) + '</div></div><div class="story-preview__meta"><span class="story-preview__metric">' + nodeCount + ' 个节点</span></div></article>';
  }
  function layoutBubbles() {
    var viewport = $("[data-story-viewport]");
    var canvas = viewport && viewport.querySelector("[data-story-bubble-canvas]");
    var cards = canvas ? Array.prototype.slice.call(canvas.querySelectorAll("[data-story-card]")) : [];
    if (!cards.length || viewport.clientWidth <= 0) return;
    var viewportWidth = viewport.clientWidth;
    var counts = cards.map(function (card) { return Number(card.dataset.nodeCount) || 0; });
    var maxCount = Math.max.apply(Math, counts.concat([1]));
    var compact = window.matchMedia && window.matchMedia("(max-width: 560px)").matches;
    var viewportHeight = compact ? Math.max(380, Math.min(480, viewportWidth * 1.12)) : Math.max(500, Math.min(620, viewportWidth * 0.62));
    var packed = window.BubblePack.pack(cards.map(function (card, index) {
      var ratio = Math.sqrt(counts[index] / maxCount);
      return { card: card, radius: (128 + (260 - 128) * ratio) / 2 };
    }).sort(function (a, b) { return b.radius - a.radius; }), Math.max(520, viewportWidth), viewportHeight, 8);
    viewport.style.height = viewportHeight + "px";
    canvas.style.width = packed.width + "px";
    canvas.style.height = packed.height + "px";
    packed.items.forEach(function (bubble) {
      bubble.card.classList.add("story-bubble");
      bubble.card.style.width = bubble.radius * 2 + "px";
      bubble.card.style.height = bubble.radius * 2 + "px";
      bubble.card.style.left = bubble.x - bubble.radius + "px";
      bubble.card.style.top = bubble.y - bubble.radius + "px";
    });
    var scale = Math.min(1, viewportWidth / packed.width, viewportHeight / packed.height);
    var panX = (viewportWidth - packed.width * scale) / 2;
    var panY = (viewportHeight - packed.height * scale) / 2;
    canvas.style.transform = "translate(" + panX + "px," + panY + "px) scale(" + scale + ")";
    canvas.classList.add("is-laid-out");
  }
  function renderLibrary() {
    var stories = state.data.stories, viewport = $("[data-story-viewport]");
    viewport.innerHTML = stories.length ? '<div class="story-bubble-canvas" data-story-bubble-canvas>' + stories.map(storyCard).join("") + '</div>' : '<div class="story-carousel__empty empty-state"><div class="empty-state__icon" aria-hidden="true">∅</div><p>暂时还没有故事</p></div>';
    layoutBubbles();
    $("[data-story-prev]").disabled = state.activeIndex <= 0;
    $("[data-story-next]").disabled = state.activeIndex >= stories.length - 1;
    $("[data-story-status]").textContent = stories.length ? (state.activeIndex + 1) + " / " + stories.length : "暂无故事";
  }
  function renderLibraryLoading() {
    var viewport = $("[data-story-viewport]");
    if (!viewport) return;
    viewport.innerHTML = '<div class="story-carousel__empty story-carousel__loading" role="status" aria-live="polite"><span class="story-loading__spinner" aria-hidden="true"></span><p>正在加载故事…</p></div>';
  }
  function renderLibraryUnavailable() {
    var viewport = $("[data-story-viewport]");
    if (!viewport) return;
    viewport.innerHTML = '<div class="story-carousel__empty story-carousel__loading" role="status" aria-live="polite"><p>连接超时，请稍后再试。</p></div>';
  }
  function showLibrary() {
    clearLastView();
    hideNodeTooltip();
    hideBubbleTooltip();
    state.composerMode = null;
    var libraryHeader = $("[data-story-library-header]");
    if (libraryHeader) libraryHeader.hidden = false;
    $("[data-story-detail]").classList.remove("is-creating");
    $("[data-story-stage]").classList.remove("is-showing-tree");
    $("[data-story-library]").hidden = false;
    $("[data-story-detail]").hidden = true;
    syncTreePanePin(true);
    renderLibrary();
  }
  function showDetail(card) {
    if (!state.story) return;
    saveLastView();
    hideNodeTooltip();
    hideBubbleTooltip();
    var libraryHeader = $("[data-story-library-header]");
    if (libraryHeader) libraryHeader.hidden = true;
    $("[data-story-detail]").classList.remove("is-creating");
    $("[data-story-library]").hidden = true;
    $("[data-story-detail]").hidden = false;
    $("[data-story-stage]").classList.add("is-showing-tree");
    renderDetail(true);
    saveLastView();
    requestAnimationFrame(function () { syncTreePanePin(true); });
  }
  function showCreateStory() {
    hideNodeTooltip();
    state.composerMode = "create";
    var libraryHeader = $("[data-story-library-header]");
    var detail = $("[data-story-detail]");
    if (libraryHeader) libraryHeader.hidden = true;
    $("[data-story-library]").hidden = true;
    detail.hidden = false;
    detail.classList.add("is-creating");
    $("[data-story-stage]").classList.add("is-showing-tree");
    $("[data-story-detail-title]").textContent = "创建故事";
    renderComposer();
    requestAnimationFrame(function () {
      syncTreePanePin(true);
      var author = detail.querySelector('[name="author_name"]');
      if (author) author.focus();
    });
  }
  function nodeMarkup(node) {
    var kids = children(node);
    var childMarkup = kids.length ? "<ul>" + kids.map(nodeMarkup).join("") + "</ul>" : "";
    var branchTitle = node.is_leaf && node.branch_title ? '<span class="story-node__tooltip-branch"><small>本支故事</small><strong>' + markdownInline(node.branch_title) + '</strong></span>' : "";
    var tooltip = '<span class="story-node__tooltip"><strong class="story-node__tooltip-title">' + markdownInline(node.title || "") + '</strong>' + branchTitle + '<span class="story-node__tooltip-meta"><span>' + esc(node.author_name || "") + '</span><span>' + esc(formatTime(node.updated_at)) + '</span></span><span class="story-node__tooltip-snippet">' + markdownInline(snippet(node.content)) + '</span><code class="story-node__tooltip-id">' + esc(node.fragment_id || node.id) + '</code></span>';
    return '<li class="story-node' + (state.selected === node.id ? " is-selected" : "") + (node.is_leaf ? " is-leaf" : "") + '" data-node="' + node.id + '"><span class="story-node__dot" role="button" tabindex="0" aria-label="' + esc(node.title || node.fragment_id) + '">' + tooltip + nodeLikeIndicator(node, node.fragment_id || node.id) + '</span>' + childMarkup + '</li>';
  }
  function renderReader() {
    var node = nodeById(state.selected) || firstNode();
    if (!node) { $("[data-reader-branch-title]").hidden = true; $("[data-reader-title]").textContent = ""; $("[data-reader-content]").innerHTML = "<p>暂无段落</p>"; return; }
    state.selected = node.id;
    var nodes = state.readerMode === "path" ? pathTo(node) : [node];
    var branchHeading = $("[data-reader-branch-title]");
    var showBranchTitle = state.readerMode === "path" && node.is_leaf && node.branch_title;
    branchHeading.hidden = !showBranchTitle;
    branchHeading.innerHTML = showBranchTitle ? '<span>本支故事</span><strong>' + markdownInline(node.branch_title) + "</strong>" : "";
    $("[data-reader-title]").innerHTML = markdownInline(node.title || "");
    $("[data-reader-content]").innerHTML = nodes.map(function (item) { var contact = item.public_contact && item.contact ? '<span class="story-reader__contact">' + esc(item.contact) + '</span>' : ''; return '<article class="story-reader__paragraph"><header><span class="story-reader__meta"><span>' + esc(item.author_name) + '</span><time>' + esc(formatTime(item.updated_at)) + '</time>' + contact + '</span>' + likeButton("node", item, item.fragment_id || item.id, "story-reader__like") + '</header><div class="story-reader__markdown">' + markdownHtml(item.content) + '</div></article>'; }).join("");
    $("[data-reader-mode=\"node\"]").classList.toggle("is-active", state.readerMode === "node");
    $("[data-reader-mode=\"path\"]").classList.toggle("is-active", state.readerMode === "path");
  }
  function selectNode(nodeId) {
    var node = nodeById(nodeId);
    if (!node) return;
    if (String(state.selected) === String(node.id)) return;
    hideNodeTooltip();
    state.composerMode = null;
    state.selected = node.id;
    Array.prototype.forEach.call(root.querySelectorAll("[data-story-tree] .story-node"), function (item) {
      item.classList.toggle("is-selected", String(item.dataset.node) === String(node.id));
    });
    renderReader();
    renderComposer();
    saveLastView();
    requestAnimationFrame(scrollNodeHeadingIntoView);
  }
  function renderComposer() {
    var box = $("[data-story-composer]"), node = nodeById(state.selected), edit = state.composerMode === "edit", creating = state.composerMode === "create", deleting = state.composerMode === "delete";
    if (!state.composerMode) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    if (deleting) {
      box.innerHTML = '<form data-node-form data-mode="delete"><h3>' + labels.delete + '</h3><p class="story-author-note">署名： ' + esc(node && node.author_name) + '</p><p class="story-form-note">删除操作会同时移除当前节点及它的所有后续节点。</p><label>编辑密码<input type="password" name="edit_key" required placeholder="' + esc(labels.requiredKey) + '"></label><div class="story-form-actions"><button type="submit" class="is-danger">确认删除</button><button type="button" data-action="close-composer">取消</button></div><p class="story-form-error" data-form-error role="alert"></p></form>';
      decorateComposer();
      return;
    }
    var draftMode = edit ? "edit" : (creating ? "create" : "reply");
    var cachedContent = draftContent(draftMode);
    var initialContent = cachedContent !== null ? cachedContent : (edit && node ? node.content : "");
    box.innerHTML = '<form data-node-form data-mode="' + (edit ? "edit" : "reply") + '"><h3>' + (edit ? labels.edit : (creating ? "创建故事" : labels.create)) + '</h3>' + (edit ? '<p class="story-author-note">署名： ' + esc(node && node.author_name) + '</p><p class="story-form-note">想要修改任意内容，请输入创建该段落时设置的编辑密码。</p>' : '<label>署名<input name="author_name" maxlength="40" required></label>') + '<label>正文<textarea name="content" maxlength="2000" required>' + esc(initialContent) + '</textarea></label><label>编辑密码<input type="password" name="edit_key" required placeholder="' + esc(edit ? labels.requiredKey : "用于以后编辑或删除") + '"></label><div class="story-form-actions"><button type="submit">提交</button>' + (edit ? '<button type="button" data-action="delete" class="is-danger" title="删除当前节点及所有后续节点">' + labels.delete + '</button>' : '') + '<button type="button" data-action="close-composer">取消</button></div><p class="form-error" data-form-error role="alert"></p></form>';
    decorateComposer();
  }
  function decorateComposer() {
    var form = $("[data-node-form]");
    if (!form || form.dataset.decorated) return;
    form.dataset.decorated = "true";
    var node = nodeById(state.selected);
    if (state.composerMode === "create") form.dataset.mode = "create";
    var labelsInForm = Array.prototype.slice.call(form.querySelectorAll("label"));
    if (state.composerMode === "edit") {
      var authorNote = form.querySelector(".story-author-note");
      if (authorNote && node) {
        authorNote.innerHTML = '<label>署名<input name="author_name" maxlength="40" required value="' + esc(node.author_name || "") + '"></label>';
        labelsInForm.push(authorNote.querySelector("label"));
      }
    }
    var contentForTitle = labelsInForm.find(function (item) { return item.querySelector('textarea[name="content"]'); });
    if (contentForTitle) {
      var titleLabel = document.createElement("label");
      titleLabel.textContent = "段落标题";
      var titleInput = document.createElement("input");
      titleInput.name = "title";
      titleInput.maxLength = 80;
      titleInput.required = false;
      var cachedTitle = draftField(form.dataset.mode, "title");
      if (cachedTitle !== null) titleInput.value = cachedTitle;
      else if (state.composerMode !== "create" && node) titleInput.value = String(node.title || "");
      titleLabel.appendChild(titleInput);
      var titleDetails = document.createElement("details");
      titleDetails.className = "story-title-details";
      var titleSummary = document.createElement("summary");
      titleSummary.textContent = "段落标题（可选）";
      var titleContent = document.createElement("div");
      titleContent.className = "story-collapsible__content";
      var titleInner = document.createElement("div");
      titleInner.className = "story-collapsible__inner";
      titleInner.appendChild(titleLabel);
      titleContent.appendChild(titleInner);
      titleDetails.append(titleSummary, titleContent);
      contentForTitle.parentNode.insertBefore(titleDetails, contentForTitle);
      labelsInForm.push(titleLabel);
    }
    var author = labelsInForm.find(function (item) { return item.querySelector('[name="author_name"]'); });
    var key = labelsInForm.find(function (item) { return item.querySelector('[name="edit_key"]'); });
    if (author) {
      var authorInput = author.querySelector('[name="author_name"]');
      try { if (authorInput && !authorInput.value) authorInput.value = localStorage.getItem(AUTHOR_STORAGE) || ""; } catch (_) {}
    }
    if (authorInput && key && (form.dataset.mode === "create" || form.dataset.mode === "reply")) {
      var editKeyInput = key.querySelector('[name="edit_key"]');
      if (editKeyInput && !editKeyInput.value) editKeyInput.value = authorInput.value;
    }
    if (key) decorateEditKeyVisibility(key.querySelector('[name="edit_key"]'));
    if (key) {
      var identity = document.createElement("div"); identity.className = "story-form-identity";
      if (author) {
        author.parentNode.insertBefore(identity, author);
        identity.appendChild(author);
      } else {
        key.parentNode.insertBefore(identity, key);
      }
      identity.appendChild(key);
      var contact = document.createElement("details"); contact.className = "story-contact-details";
      contact.innerHTML = '<summary>联系方式（可选）</summary><div class="story-collapsible__content"><div class="story-collapsible__inner"><label>联系方式<input name="contact" maxlength="120" placeholder="邮箱、微信或其他方式"></label><label class="story-contact-public"><input type="checkbox" name="public_contact" value="true">公开显示</label><p class="story-contact-privacy" aria-live="polite"></p></div></div>';
      if (state.composerMode === "edit") identity.parentNode.insertBefore(contact, identity);
      else identity.parentNode.insertBefore(contact, identity.nextSibling);
      if (state.composerMode === "create") {
        var formContent = labelsInForm.find(function (item) { return item.querySelector('textarea[name="content"]'); });
        if (formContent) {
          formContent.parentNode.insertBefore(identity, formContent.nextSibling);
          identity.parentNode.insertBefore(contact, identity.nextSibling);
        }
      }
      var contactInput = contact.querySelector('[name="contact"]');
      var publicContactInput = contact.querySelector('[name="public_contact"]');
      if (state.composerMode === "edit" && node) {
        publicContactInput.checked = node.public_contact === true || node.public_contact === 1;
        contactInput.dataset.originalContact = String(node.contact || "");
        contactInput.value = publicContactInput.checked ? contactInput.dataset.originalContact : (node.contact ? "******" : "");
      }
      syncContactPrivacy(publicContactInput);
    }
    if (state.composerMode === "create" || (state.composerMode === "edit" && node && node.parent_id === null)) {
      var contentLabel = labelsInForm.find(function (item) { return item.querySelector('textarea[name="content"]'); });
      if (contentLabel) {
        var previewDetails = document.createElement("details"); previewDetails.className = "story-preview-field";
        previewDetails.innerHTML = '<summary>气泡简介（可选）</summary><div class="story-collapsible__content"><div class="story-collapsible__inner"><label>简介<input name="preview" maxlength="120" placeholder="留空则自动取正文第一句话"></label></div></div>';
        contentLabel.parentNode.insertBefore(previewDetails, contentLabel);
        var previewInput = previewDetails.querySelector('[name="preview"]');
        if (state.composerMode === "edit" && state.story) previewInput.value = String(state.story.preview || "");
        else { var cachedPreview = draftField("create", "preview"); if (previewInput && cachedPreview !== null) previewInput.value = cachedPreview; }
      }
    }
    if ((state.composerMode === "create" || state.composerMode === "reply") && state.apiMode && lastActionRequiresKey()) revealRateLimitKey(form, false);
    var contentLabel = labelsInForm.find(function (item) { return item.querySelector('textarea[name="content"]'); });
    if (contentLabel && (state.composerMode === "reply" || state.composerMode === "edit")) {
      var leafLabel = document.createElement("label"); leafLabel.className = "story-leaf-toggle";
      leafLabel.innerHTML = '<span><input type="checkbox" name="is_leaf" value="true" ' + (state.composerMode === "edit" && node && node.is_leaf ? "checked" : "") + '> 将此分支标记为完结</span>';
      contentLabel.parentNode.insertBefore(leafLabel, contentLabel);
      var branchTitleLabel = document.createElement("label");
      branchTitleLabel.className = "story-branch-title-field";
      branchTitleLabel.innerHTML = '这一支的标题<input name="branch_title" maxlength="80" placeholder="为这支完整故事命名">';
      var branchTitleInput = branchTitleLabel.querySelector("input");
      var cachedBranchTitle = draftField(form.dataset.mode, "branch_title");
      if (cachedBranchTitle !== null) branchTitleInput.value = cachedBranchTitle;
      else if (state.composerMode === "edit" && node) branchTitleInput.value = String(node.branch_title || "");
      branchTitleLabel.hidden = !leafLabel.querySelector('[name="is_leaf"]').checked;
      branchTitleInput.required = !branchTitleLabel.hidden;
      contentLabel.parentNode.insertBefore(branchTitleLabel, contentLabel);
    }
    var legacyDelete = form.querySelector('[data-action="delete"]');
    if (legacyDelete) legacyDelete.remove();
    if (state.composerMode !== "edit" && state.composerMode !== "delete") return;
    var toggle = document.createElement("div"); toggle.className = "story-editor-toggle";
    toggle.innerHTML = '<button type="button" data-editor-mode="edit" class="is-active">编辑</button><button type="button" data-editor-mode="delete">删除</button>';
    var heading = form.querySelector("h3"), note = form.querySelector(".story-form-note");
    var editorControls = document.createElement("div"); editorControls.className = "story-editor-controls";
    editorControls.appendChild(toggle);
    if (note) editorControls.appendChild(note);
    form.insertBefore(editorControls, form.firstChild);
    if (heading) heading.hidden = true;
    if (form.dataset.mode === "delete") { toggle.querySelector('[data-editor-mode="edit"]').classList.remove("is-active"); toggle.querySelector('[data-editor-mode="delete"]').classList.add("is-active"); }
  }
  function renderDetail(fitTree) {
    hideNodeTooltip();
    var select = $("[data-story-select]");
    select.innerHTML = state.data.stories.map(function (story) { return '<option value="' + story.id + '">' + esc(story.title) + '</option>'; }).join("");
    select.value = state.story.id;
    $("[data-story-detail-title]").textContent = state.story.title;
    renderStoryLike();
    if (!nodeById(state.selected)) {
      var defaultNode = firstNode();
      state.selected = defaultNode ? defaultNode.id : null;
    }
    var roots = state.story.nodes.filter(function (node) { return node.parent_id === null; });
    $("[data-story-tree]").innerHTML = roots.length ? '<ul class="story-tree-root">' + roots.map(nodeMarkup).join("") + "</ul>" : '<p>暂无段落</p>';
    if (fitTree) scheduleFitTreeView();
    else applyTreeView();
    renderReader();
    renderComposer();
  }
  function chooseStory(value) { hideNodeTooltip(); state.story = state.data.stories.find(function (story) { return String(story.id) === String(value); }); state.selected = null; state.readerMode = "node"; state.composerMode = null; resetTreeView(); renderDetail(true); }
  function moveStory(delta) { var index = state.data.stories.indexOf(state.story); var next = Math.max(0, Math.min(state.data.stories.length - 1, index + delta)); state.story = state.data.stories[next]; renderLibrary(); }
  function openComposer(mode) { state.composerMode = mode; renderComposer(); var box = $("[data-story-composer]"); if (box) box.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  function toggleStoryDetails(details) {
    if (!details || (!details.classList.contains("story-contact-details") && !details.classList.contains("story-preview-field") && !details.classList.contains("story-title-details"))) return;
    if (details.classList.contains("is-expanded")) {
      var closeToken = (details._storyToggleToken || 0) + 1;
      details._storyToggleToken = closeToken;
      details.classList.remove("is-expanded");
      details.classList.add("is-collapsing");
      var content = details.querySelector(".story-collapsible__content");
      var finish = function () { if (details._storyToggleToken !== closeToken) return; details.open = false; details.classList.remove("is-collapsing"); };
      if (content) {
        content.addEventListener("transitionend", finish, { once: true });
        window.setTimeout(finish, 360);
      } else finish();
      return;
    }
    details._storyToggleToken = (details._storyToggleToken || 0) + 1;
    details.classList.remove("is-collapsing");
    details.open = true;
    requestAnimationFrame(function () { details.classList.add("is-expanded"); });
  }
  function syncContactPrivacy(input) {
    var form = input && input.closest("[data-node-form]"), privacy = form && form.querySelector(".story-contact-privacy");
    if (!privacy) return;
    privacy.replaceChildren();
    if (input.checked) {
      privacy.textContent = "联系方式会在段落中显示";
    } else {
      var emphasis = document.createElement("strong");
      emphasis.className = "story-contact-privacy__emphasis";
      emphasis.textContent = "不会";
      privacy.append("联系方式", emphasis, "以任何形式被公开");
    }
    privacy.classList.toggle("is-public", input.checked);
  }
  function showError(message) { var error = $("[data-form-error]"); if (error) error.textContent = message || ""; }
  function revealRateLimitKey(form, focusInput) {
    if (!form) return;
    var details = form.querySelector(".story-rate-limit-details");
    if (!details) {
      details = document.createElement("details");
      details.className = "story-title-details story-rate-limit-details";
      details.innerHTML = '<summary>\u989d\u5916\u5199\u4f5c key</summary><div class="story-collapsible__content"><div class="story-collapsible__inner"><p class="story-form-note">\u8ddd\u79bb\u4e0a\u4e00\u6b21\u521b\u5efa\u8282\u70b9\u65f6\u95f4\u592a\u77ed\uff0c\u9700\u8981\u989d\u5916\u586b\u5199 key\u3002</p><label>\u989d\u5916\u5199\u4f5c key<input type="password" name="rate_limit_key" autocomplete="off" required></label></div></div>';
      form.insertBefore(details, form.querySelector(".story-form-actions"));
    }
    details.open = true;
    requestAnimationFrame(function () { details.classList.add("is-expanded"); });
    if (focusInput) {
      var input = details.querySelector('[name="rate_limit_key"]');
      details.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (input) input.focus({ preventScroll: true });
    }
  }
  function apiRequest(url, options) {
    return fetch(url, options).then(function (response) {
      if (response.status === 204) return null;
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.error || "请求失败（HTTP " + response.status + "）");
          error.status = response.status;
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }
  function submitToApi(mode, values, node, contactValue, contactField) {
    var payload = {
      title: String(values.get("title") || "").trim(),
      author_name: String(values.get("author_name") || "").trim(),
      content: String(values.get("content") || "").trim(),
      edit_key: String(values.get("edit_key") || ""),
      is_leaf: values.get("is_leaf") === "true",
      branch_title: String(values.get("branch_title") || "").trim(),
      public_contact: values.get("public_contact") === "true",
      preview: String(values.get("preview") || "").trim()
    };
    if (mode === "create" || mode === "reply") payload.rate_limit_key = String(values.get("rate_limit_key") || "");
    if (!(mode === "edit" && contactField && contactField.dataset.originalContact && String(values.get("contact") || "").trim() === "******")) payload.contact = contactValue;
    var writeHeaders = { "content-type": "application/json", "x-story-device-id": deviceId() };
    if (mode === "create") return apiRequest("/api/stories", { method: "POST", headers: writeHeaders, body: JSON.stringify(payload) });
    if (mode === "reply") {
      payload.parent_id = node && node.id;
      return apiRequest("/api/stories/" + encodeURIComponent(state.story.slug) + "/nodes", { method: "POST", headers: writeHeaders, body: JSON.stringify(payload) });
    }
    var fragmentId = node && (node.fragment_id || node.id);
    return apiRequest("/api/story-nodes/" + encodeURIComponent(fragmentId), { method: mode === "delete" ? "DELETE" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  }
  function bind() {
    $("[data-story-select]").onchange = function () { chooseStory(this.value); };
    $("[data-story-tree]").onclick = function (event) { var like = event.target.closest("[data-like-type]"); if (like) { event.stopPropagation(); toggleLike(like); return; } var action = event.target.closest("[data-action]"); if (action) { if (action.dataset.action === "create-from") openComposer("reply"); else if (action.dataset.action === "edit") openComposer("edit"); return; } var dot = event.target.closest(".story-node__dot"); if (!dot) return; var item = dot.closest("[data-node]"); if (item) { selectNode(item.dataset.node); centerTreeNode(item); } };
    $("[data-reader-mode=\"node\"]").onclick = function () { state.readerMode = "node"; renderReader(); };
    $("[data-reader-mode=\"path\"]").onclick = function () { state.readerMode = "path"; renderReader(); };
  }
  root.addEventListener("click", function (event) {
    var editKeyToggle = event.target.closest("[data-edit-key-visibility]");
    if (editKeyToggle) {
      var editKeyInput = editKeyToggle.parentNode.querySelector('input[name="edit_key"]');
      if (!editKeyInput) return;
      var visible = editKeyInput.type === "password";
      editKeyInput.type = visible ? "text" : "password";
      editKeyToggle.setAttribute("aria-pressed", String(visible));
      editKeyToggle.setAttribute("aria-label", visible ? "\u9690\u85cf\u7f16\u8f91\u5bc6\u7801" : "\u663e\u793a\u7f16\u8f91\u5bc6\u7801");
      editKeyToggle.title = visible ? "\u9690\u85cf\u7f16\u8f91\u5bc6\u7801" : "\u663e\u793a\u7f16\u8f91\u5bc6\u7801";
      editKeyToggle.innerHTML = editKeyVisibilityIcon(visible);
      editKeyInput.focus({ preventScroll: true });
      return;
    }
    var summary = event.target.closest("details > summary");
    if (summary && (summary.parentNode.classList.contains("story-contact-details") || summary.parentNode.classList.contains("story-preview-field") || summary.parentNode.classList.contains("story-title-details"))) {
      event.preventDefault();
      toggleStoryDetails(summary.parentNode);
      return;
    }
    var like = event.target.closest("[data-like-type]");
    if (like) { toggleLike(like); return; }
    var card = event.target.closest("[data-story-card]");
    if (card) { var index = Number(card.dataset.storyIndex); state.activeIndex = index; state.story = state.data.stories[index]; showDetail(card); return; }
    if (event.target.matches("[data-story-prev]")) moveStory(-1);
    if (event.target.matches("[data-story-next]")) moveStory(1);
    if (event.target.matches("[data-story-back]")) showLibrary();
    if (event.target.matches("[data-create-story]")) showCreateStory();
    if (event.target.matches('[data-action="create-from"]')) openComposer("reply");
    if (event.target.matches('[data-action="edit"]')) openComposer("edit");
    if (event.target.matches('[data-action="close-composer"]')) { if (state.composerMode === "create") showLibrary(); else { state.composerMode = null; renderComposer(); } }
    if (event.target.matches('[data-action="delete"]')) openComposer("delete");
    if (event.target.matches("[data-editor-mode]")) { state.composerMode = event.target.dataset.editorMode; renderComposer(); }
  });
  root.addEventListener("pointermove", function (event) {
    var dot = event.target.closest(".story-node__dot");
    if (dot && activeTooltipDot === dot) positionNodeTooltip(event.clientX, event.clientY);
    if (activeBubbleTooltipCard) positionBubbleTooltip(event.clientX, event.clientY);
    var storyViewport = event.target.closest("[data-story-viewport]");
    if (!storyViewport || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      Array.prototype.forEach.call(root.querySelectorAll(".story-bubble"), function (card) {
        card.style.removeProperty("--pointer-x");
        card.style.removeProperty("--pointer-y");
      });
      return;
    }
    var canvas = event.target.closest("[data-story-bubble-canvas]");
    var canvasScale = canvas && canvas.offsetWidth ? canvas.getBoundingClientRect().width / canvas.offsetWidth : 1;
    var sourceCard = event.target.closest(".story-bubble") || activeBubbleTooltipCard;
    var sourceRect = sourceCard && sourceCard.getBoundingClientRect();
    var sourceRadius = sourceRect ? sourceRect.width / 2 : 0;
    var sourceCenterX = sourceRect ? sourceRect.left + sourceRect.width / 2 : event.clientX;
    var sourceCenterY = sourceRect ? sourceRect.top + sourceRect.height / 2 : event.clientY;
    var sourcePointerX = sourceCenterX - event.clientX;
    var sourcePointerY = sourceCenterY - event.clientY;
    var sourcePointerDistance = Math.sqrt(sourcePointerX * sourcePointerX + sourcePointerY * sourcePointerY);
    var sourceDirectionX = sourcePointerDistance > 0.1 ? sourcePointerX / sourcePointerDistance : 0;
    var sourceDirectionY = sourcePointerDistance > 0.1 ? sourcePointerY / sourcePointerDistance : -1;
    var sourceInfluence = Math.max(90, sourceRadius + 35);
    var sourceMaxPush = Math.max(10, Math.min(20, sourceRadius * 0.16));
    var sourcePush = sourceRadius && sourcePointerDistance < sourceInfluence
      ? (1 - sourcePointerDistance / sourceInfluence) * sourceMaxPush
      : 0;
    var projectedSourceX = sourceCenterX + sourceDirectionX * sourcePush;
    var projectedSourceY = sourceCenterY + sourceDirectionY * sourcePush;
    Array.prototype.forEach.call(root.querySelectorAll(".story-bubble"), function (card) {
      var rect = card.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;
      var visibleRadius = rect.width / 2;
      if (card === sourceCard) {
        card.style.setProperty("--pointer-x", (sourceDirectionX * sourcePush / Math.max(canvasScale, 0.01)) + "px");
        card.style.setProperty("--pointer-y", (sourceDirectionY * sourcePush / Math.max(canvasScale, 0.01)) + "px");
        return;
      }
      if (!sourceRadius) {
        var pointerX = event.clientX - centerX;
        var pointerY = event.clientY - centerY;
        var pointerDistance = Math.sqrt(pointerX * pointerX + pointerY * pointerY);
        var pointerInfluence = Math.max(110, visibleRadius + 45);
        if (pointerDistance < pointerInfluence && pointerDistance > 0.1) {
          var pointerForce = (1 - pointerDistance / pointerInfluence) * 10 / Math.max(canvasScale, 0.01);
          card.style.setProperty("--pointer-x", (-pointerX / pointerDistance * pointerForce) + "px");
          card.style.setProperty("--pointer-y", (-pointerY / pointerDistance * pointerForce) + "px");
        } else {
          card.style.removeProperty("--pointer-x");
          card.style.removeProperty("--pointer-y");
        }
        return;
      }
      var sourceToTargetX = centerX - sourceCenterX;
      var sourceToTargetY = centerY - sourceCenterY;
      var sourceToTargetDistance = Math.sqrt(sourceToTargetX * sourceToTargetX + sourceToTargetY * sourceToTargetY);
      var influenceRadius = sourceRadius
        ? sourceRadius + visibleRadius + Math.max(60, sourceRadius * 0.85)
        : Math.max(110, visibleRadius + 45);
      if (sourceToTargetDistance < influenceRadius && sourceToTargetDistance > 0.1) {
        var targetDirectionX = sourceToTargetX / sourceToTargetDistance;
        var targetDirectionY = sourceToTargetY / sourceToTargetDistance;
        var alignment = Math.max(0, targetDirectionX * sourceDirectionX + targetDirectionY * sourceDirectionY);
        var directionalWeight = 0.12 + 0.88 * alignment * alignment;
        var maxPush = Math.max(10, Math.min(20, (sourceRadius + visibleRadius) * 0.08));
        var directionalPush = (1 - sourceToTargetDistance / influenceRadius) * maxPush * directionalWeight;
        var projectedX = centerX - projectedSourceX;
        var projectedY = centerY - projectedSourceY;
        var projectedDistance = Math.sqrt(projectedX * projectedX + projectedY * projectedY);
        var overlapPush = Math.max(0, sourceRadius + visibleRadius + 8 - projectedDistance);
        var force = Math.max(directionalPush, overlapPush) / Math.max(canvasScale, 0.01);
        var pushDirectionX = projectedDistance > 0.1 ? projectedX / projectedDistance : targetDirectionX;
        var pushDirectionY = projectedDistance > 0.1 ? projectedY / projectedDistance : targetDirectionY;
        card.style.setProperty("--pointer-x", (pushDirectionX * force) + "px");
        card.style.setProperty("--pointer-y", (pushDirectionY * force) + "px");
      } else {
        card.style.removeProperty("--pointer-x");
        card.style.removeProperty("--pointer-y");
      }
    });
  }, { passive: true });
  root.addEventListener("pointerleave", function () {
    hideNodeTooltip();
    hideBubbleTooltip();
    Array.prototype.forEach.call(root.querySelectorAll(".story-bubble"), function (card) {
      card.style.removeProperty("--pointer-x");
      card.style.removeProperty("--pointer-y");
    });
  });
  window.addEventListener("blur", function () { hideNodeTooltip(); hideBubbleTooltip(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) { hideNodeTooltip(); hideBubbleTooltip(); } });
  window.addEventListener("pagehide", function () { hideNodeTooltip(); hideBubbleTooltip(); });
  new MutationObserver(function () {
    if (root.hidden) {
      hideNodeTooltip();
      hideBubbleTooltip();
      return;
    }
    if (dataReady && !$('[data-story-library]').hidden) requestAnimationFrame(layoutBubbles);
  }).observe(root, { attributes: true, attributeFilter: ["hidden"] });
  root.addEventListener("pointerdown", function (event) {
    inputModality = "pointer";
    var viewport = event.target.closest("[data-story-tree]");
    if (!viewport || event.target.closest("button") || event.target.closest(".story-node__dot")) return;
    stopTreeCentering();
    state.treeView.dragging = true;
    state.treeView.pointerId = event.pointerId;
    state.treeView.lastX = event.clientX;
    state.treeView.lastY = event.clientY;
    viewport.classList.add("is-panning");
    viewport.setPointerCapture(event.pointerId);
  });
  root.addEventListener("pointermove", function (event) {
    if (!state.treeView.dragging || event.pointerId !== state.treeView.pointerId) return;
    state.treeView.x += event.clientX - state.treeView.lastX;
    state.treeView.y += event.clientY - state.treeView.lastY;
    state.treeView.lastX = event.clientX;
    state.treeView.lastY = event.clientY;
    applyTreeView();
  });
  root.addEventListener("pointerup", function (event) {
    if (event.pointerId !== state.treeView.pointerId) return;
    state.treeView.dragging = false;
    var viewport = event.target.closest("[data-story-tree]");
    if (viewport) viewport.classList.remove("is-panning");
  });
  root.addEventListener("pointercancel", function () { state.treeView.dragging = false; Array.prototype.forEach.call(root.querySelectorAll("[data-story-tree]"), function (viewport) { viewport.classList.remove("is-panning"); }); });
  root.addEventListener("wheel", function (event) {
    var viewport = event.target.closest("[data-story-tree]");
    if (!viewport) return;
    event.preventDefault();
    stopTreeCentering();
    var rect = viewport.getBoundingClientRect(), originX = event.clientX - rect.left, originY = event.clientY - rect.top;
    var previous = state.treeView.scale, next = Math.max(.55, Math.min(2.6, previous * (event.deltaY < 0 ? 1.1 : .9)));
    state.treeView.x = originX - (originX - state.treeView.x) * next / previous;
    state.treeView.y = originY - (originY - state.treeView.y) * next / previous;
    state.treeView.scale = next;
    applyTreeView();
  }, { passive: false });
  root.addEventListener("pointerover", function (event) {
    var card = event.target.closest(".story-bubble");
    if (card && !card.contains(event.relatedTarget)) showBubbleTooltip(card, event.clientX, event.clientY);
    var dot = event.target.closest(".story-node__dot");
    if (!dot) return;
    var rect = dot.getBoundingClientRect();
    if (activeTooltipDot !== dot) showNodeTooltip(dot, event.clientX, event.clientY);
  });
  root.addEventListener("pointerout", function (event) {
    var card = event.target.closest(".story-bubble");
    if (card && !card.contains(event.relatedTarget)) hideBubbleTooltip(card);
    var dot = event.target.closest(".story-node__dot");
    if (!dot || dot.contains(event.relatedTarget)) return;
    hideNodeTooltip(dot);
  });
  root.addEventListener("focusin", function (event) {
    if (inputModality !== "keyboard") return;
    var dot = event.target.closest(".story-node__dot");
    if (!dot) return;
    var rect = dot.getBoundingClientRect();
    showNodeTooltip(dot, rect.right, rect.bottom);
  });
  root.addEventListener("focusout", function (event) {
    var dot = event.target.closest(".story-node__dot");
    if (dot && !dot.contains(event.relatedTarget)) hideNodeTooltip(dot);
  });
  document.addEventListener("keydown", function () { inputModality = "keyboard"; });
  root.addEventListener("input", function (event) {
    if (event.target.matches('[data-node-form] input[name="author_name"]')) {
      var identityForm = event.target.closest("[data-node-form]");
      if (identityForm && (identityForm.dataset.mode === "create" || identityForm.dataset.mode === "reply")) {
        var followingKey = identityForm.querySelector('input[name="edit_key"]');
        if (followingKey && followingKey.dataset.manuallyEdited !== "true") followingKey.value = event.target.value;
      }
      try {
        var authorName = event.target.value.trim();
        if (authorName) localStorage.setItem(AUTHOR_STORAGE, authorName);
        else localStorage.removeItem(AUTHOR_STORAGE);
      } catch (_) {}
      return;
    }
    if (event.target.matches('[data-node-form] input[name="edit_key"]')) {
      var keyForm = event.target.closest("[data-node-form]");
      if (keyForm && (keyForm.dataset.mode === "create" || keyForm.dataset.mode === "reply")) event.target.dataset.manuallyEdited = "true";
      return;
    }
    if (event.target.matches('[data-node-form] input[name="title"]')) {
      var titleForm = event.target.closest("[data-node-form]");
      if (titleForm) saveDraftField(titleForm.dataset.mode, "title", event.target.value);
      return;
    }
    if (event.target.matches('[data-node-form] input[name="branch_title"]')) {
      var branchTitleForm = event.target.closest("[data-node-form]");
      if (branchTitleForm) saveDraftField(branchTitleForm.dataset.mode, "branch_title", event.target.value);
      return;
    }
    if (event.target.matches('[data-node-form] input[name="preview"]')) {
      saveDraftField("create", "preview", event.target.value);
      return;
    }
    if (!event.target.matches('[data-node-form] textarea[name="content"]')) return;
    var form = event.target.closest("[data-node-form]");
    if (form) saveDraftContent(form.dataset.mode, event.target.value);
  });
  root.addEventListener("change", function (event) {
    if (event.target.matches('[data-node-form] input[name="public_contact"]')) syncContactPrivacy(event.target);
    if (event.target.matches('[data-node-form] input[name="is_leaf"]')) {
      var branchTitleField = event.target.closest("form").querySelector(".story-branch-title-field");
      if (branchTitleField) {
        branchTitleField.hidden = !event.target.checked;
        branchTitleField.querySelector("input").required = event.target.checked;
      }
    }
  });
  root.addEventListener("submit", function (event) {
    if (!event.target.matches("[data-node-form]")) return;
    event.preventDefault();
    if (!dataReady || !state.data || !Array.isArray(state.data.stories)) {
      showError("故事数据仍在加载，请稍后再提交。");
      return;
    }
    var form = event.target, values = new FormData(form), mode = form.dataset.mode, node = nodeById(state.selected);
    var contactValue = String(values.get("contact") || "").trim();
    var submittedTitle = String(values.get("title") || "").trim();
    var submittedBranchTitle = String(values.get("branch_title") || "").trim();
    var contactField = form.querySelector('[name="contact"]');
    if (mode === "edit" && contactField && contactField.dataset.originalContact && contactValue === "******") contactValue = contactField.dataset.originalContact;
    var submittedDraftKey = draftKey(mode), deletedNodeEditDraftKey = mode === "delete" ? draftKey("edit") : null;
    var submittedTitleDraftKey = draftFieldKey(mode, "title"), submittedBranchTitleDraftKey = draftFieldKey(mode, "branch_title"), submittedPreviewDraftKey = (mode === "create" || (mode === "edit" && node && node.parent_id === null)) ? draftFieldKey(mode, "preview") : null;
    var deletedNodeEditTitleDraftKey = mode === "delete" ? draftFieldKey("edit", "title") : null;
    var storyRemoved = false;
    var submitButton = form.querySelector('button[type="submit"]');
    showError("");
    if (submitButton) { submitButton.disabled = true; submitButton.classList.add("is-submitting"); submitButton.setAttribute("aria-busy", "true"); }
    if (state.apiMode) {
      submitToApi(mode, values, node, contactValue, contactField).then(function (result) {
        if (mode === "create" || mode === "reply") rememberStoryAction();
        if (mode === "create") {
          state.data.stories.push(result.story);
          state.story = result.story;
          state.activeIndex = state.data.stories.length - 1;
          state.selected = result.story.nodes[0].id;
        } else if (mode === "reply") {
          state.story.nodes.push(result.node);
          state.selected = result.node.id;
          state.story.updated_at = result.node.updated_at;
        } else if (mode === "edit") {
          Object.assign(node, result.node);
          state.story.updated_at = result.node.updated_at;
          if (node && node.parent_id === null && result.story_preview !== undefined) state.story.preview = result.story_preview;
        } else if (mode === "delete") {
          var apiDeleteIds = new Set([node.id]), apiChanged = true;
          while (apiChanged) { apiChanged = false; state.story.nodes.forEach(function (item) { if (!apiDeleteIds.has(item.id) && apiDeleteIds.has(item.parent_id)) { apiDeleteIds.add(item.id); apiChanged = true; } }); }
          state.story.nodes = state.story.nodes.filter(function (item) { return !apiDeleteIds.has(item.id); });
          if (!state.story.nodes.length) {
            var apiRemovedIndex = state.data.stories.indexOf(state.story);
            state.data.stories.splice(apiRemovedIndex, 1);
            state.activeIndex = Math.max(0, Math.min(apiRemovedIndex, state.data.stories.length - 1));
            state.story = state.data.stories[state.activeIndex] || null;
            state.selected = null;
            storyRemoved = true;
          } else state.selected = firstNode() ? firstNode().id : null;
        }
        clearDraft(submittedDraftKey);
        clearDraft(deletedNodeEditDraftKey);
        clearDraft(submittedTitleDraftKey);
        clearDraft(submittedBranchTitleDraftKey);
        clearDraft(submittedPreviewDraftKey);
        clearDraft(deletedNodeEditTitleDraftKey);
        state.composerMode = null;
        $("[data-story-detail]").classList.remove("is-creating");
        if (storyRemoved) showLibrary();
        else if (mode === "create") showDetail(null);
        else renderDetail(mode === "create" || mode === "reply" || mode === "delete");
      }).catch(function (error) {
        console.error("Story API submission failed", error);
        if (error && error.status === 429 && error.data && error.data.requires_rate_limit_key === true) {
          revealRateLimitKey(form, true);
          showError("\u8ddd\u79bb\u4e0a\u4e00\u6b21\u521b\u5efa\u8282\u70b9\u65f6\u95f4\u592a\u77ed\uff0c\u9700\u8981\u989d\u5916\u586b\u5199 key\u3002");
          return;
        }
        showError("提交失败：" + (error && error.message ? error.message : "未知错误"));
      }).finally(function () {
        if (submitButton && submitButton.isConnected) { submitButton.disabled = false; submitButton.classList.remove("is-submitting"); submitButton.removeAttribute("aria-busy"); }
      });
      return;
    }
    Promise.resolve().then(function () { return hashKey(String(values.get("edit_key") || "")); }).then(function (keyHash) {
      if ((mode === "edit" || mode === "delete") && (!node || node.edit_key_hash !== keyHash)) { showError(labels.wrongKey); return; }
      if (mode === "create") {
        var storyNumber = state.data.stories.reduce(function (max, story) { return Math.max(max, Number((story.title.match(/\d+$/) || [0])[0])); }, 0) + 1;
        var createdAt = now(), createdStory = { id: Date.now(), slug: id(), title: "故事接龙" + storyNumber, status: "published", created_at: createdAt, updated_at: createdAt, nodes: [] };
        createdStory.nodes.push({ id: Date.now() + 1, fragment_id: id(), parent_id: null, title: String(values.get("content") || "").trim().split(/[.!?\n]/)[0].slice(0, 80), author_name: String(values.get("author_name") || "").trim(), content: String(values.get("content") || "").trim(), edit_key_hash: keyHash, is_leaf: values.get("is_leaf") === "true" ? 1 : 0, created_at: createdAt, updated_at: createdAt, contact: String(values.get("contact") || "").trim(), public_contact: values.get("public_contact") === "true" });
        if (submittedTitle) createdStory.nodes[0].title = submittedTitle;
        createdStory.preview = String(values.get("preview") || "").trim();
        state.data.stories.push(createdStory); state.story = createdStory; state.activeIndex = state.data.stories.length - 1; state.selected = createdStory.nodes[0].id;
      } else if (mode === "reply") {
        if (node && node.is_leaf) { showError("请先由原作者输入编辑密码，将该节点改为可继续创作"); return; }
        var timestamp = now();
        state.story.nodes.push({ id: Date.now(), fragment_id: id(), parent_id: node ? node.id : null, title: String(values.get("content") || "").trim().split(/[.!?\n]/)[0].slice(0, 80), branch_title: values.get("is_leaf") === "true" ? submittedBranchTitle : null, author_name: String(values.get("author_name") || "").trim(), content: String(values.get("content") || "").trim(), edit_key_hash: keyHash, is_leaf: values.get("is_leaf") === "true" ? 1 : 0, created_at: timestamp, updated_at: timestamp });
        state.story.nodes[state.story.nodes.length - 1].contact = String(values.get("contact") || "").trim();
        state.story.nodes[state.story.nodes.length - 1].public_contact = values.get("public_contact") === "true";
        if (submittedTitle) state.story.nodes[state.story.nodes.length - 1].title = submittedTitle;
        state.story.updated_at = timestamp;
      } else if (mode === "edit") { node.author_name = String(values.get("author_name") || "").trim(); node.content = String(values.get("content") || "").trim(); node.contact = contactValue; node.public_contact = values.get("public_contact") === "true"; node.is_leaf = values.get("is_leaf") === "true" ? 1 : 0; node.branch_title = node.is_leaf ? submittedBranchTitle : null; node.updated_at = now(); state.story.updated_at = node.updated_at; if (node.parent_id === null) state.story.preview = String(values.get("preview") || "").trim(); }
      if (mode === "edit" && submittedTitle) node.title = submittedTitle;
      else if (mode === "delete") {
        var deleteIds = new Set([node.id]), changed = true;
        while (changed) { changed = false; state.story.nodes.forEach(function (item) { if (!deleteIds.has(item.id) && deleteIds.has(item.parent_id)) { deleteIds.add(item.id); changed = true; } }); }
        state.story.nodes = state.story.nodes.filter(function (item) { return !deleteIds.has(item.id); });
        if (!state.story.nodes.length) {
          var removedIndex = state.data.stories.indexOf(state.story);
          state.data.stories.splice(removedIndex, 1);
          state.activeIndex = Math.max(0, Math.min(removedIndex, state.data.stories.length - 1));
          state.story = state.data.stories[state.activeIndex] || null;
          state.selected = null;
          storyRemoved = true;
        } else {
          state.selected = firstNode() ? firstNode().id : null;
          state.story.updated_at = now();
        }
      }
      clearDraft(submittedDraftKey);
      clearDraft(deletedNodeEditDraftKey);
      clearDraft(submittedTitleDraftKey);
      clearDraft(submittedBranchTitleDraftKey);
      clearDraft(submittedPreviewDraftKey);
      clearDraft(deletedNodeEditTitleDraftKey);
      save(); state.composerMode = null; $("[data-story-detail]").classList.remove("is-creating");
      if (storyRemoved) showLibrary();
      else if (mode === "create") showDetail(null);
      else renderDetail(mode === "reply" || mode === "delete");
    }).catch(function (error) {
      console.error("Story form submission failed", error);
      var reason = error && error.message ? String(error.message).slice(0, 160) : "未知错误";
      showError("提交失败：" + reason);
    }).finally(function () {
      if (submitButton && submitButton.isConnected) { submitButton.disabled = false; submitButton.classList.remove("is-submitting"); submitButton.removeAttribute("aria-busy"); }
    });
  });
  function load() {
    if (dataRequest) return dataRequest;
    renderLibraryLoading();
    loadingTimer = setTimeout(function () {
      if (!dataReady) renderLibraryUnavailable();
    }, 7000);
    var useApi = document.body.dataset.backendMode === "cloudflare";
    var localFixture = function () {
      return fetch("/assets/data/story_tree.json", { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("故事示例数据加载失败（HTTP " + response.status + "）");
        return response.json();
      }).then(function (data) {
        state.data = storedStoryData() || data;
        state.apiMode = false;
        state.data.stories = state.data.stories.filter(function (story) { return Array.isArray(story.nodes) && story.nodes.length > 0; });
        return state.data;
      });
    };
    if (!useApi) dataRequest = localFixture();
    else dataRequest = fetch("/api/stories", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("故事接口加载失败（HTTP " + response.status + "）");
      return response.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data.stories)) throw new Error("故事接口返回格式不正确");
      return Promise.all(data.stories.map(function (story) {
        return fetch("/api/stories/" + encodeURIComponent(story.slug), { cache: "no-store" }).then(function (response) {
          if (!response.ok) throw new Error("故事详情加载失败（HTTP " + response.status + "）");
          return response.json();
        }).then(function (detail) { return detail.story; });
      }));
    }).then(function (stories) {
      state.data = { stories: stories.filter(function (story) { return story && Array.isArray(story.nodes) && story.nodes.length > 0; }) };
      state.apiMode = true;
      return state.data;
    }).catch(function (apiError) {
      console.warn("Story API unavailable; using local fixture", apiError);
      return localFixture();
    });
    return dataRequest;
  }
  root.addEventListener("DOMContentLoaded", function () {});
  load().then(function () {
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    normalizeIds(); save(); state.story = state.data.stories[0] || null; state.activeIndex = 0; dataReady = true; renderLibrary(); bind();
    var lastView = readLastView();
    if (lastView) {
      var restoredIndex = state.data.stories.findIndex(function (story) { return String(story.slug || story.id) === String(lastView.slug); });
      if (restoredIndex >= 0) {
        state.activeIndex = restoredIndex;
        state.story = state.data.stories[restoredIndex];
        state.selected = state.story.nodes.some(function (node) { return String(node.id) === String(lastView.nodeId); }) ? lastView.nodeId : firstNode().id;
        showDetail(null);
      } else clearLastView();
    }
    var resizeTimer;
    window.addEventListener("resize", function () {
      syncTreePanePin(true);
      if ($("[data-story-library]").hidden) { scheduleFitTreeView(); return; }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layoutBubbles, 120);
    });
    window.addEventListener("scroll", function () { syncTreePanePin(false); }, { passive: true });
  }).catch(function (error) {
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    console.warn("Story data unavailable", error);
    renderLibraryUnavailable();
  });
}());
