(function () {
  "use strict";

  const mode = document.body.dataset.backendMode || "demo";
  const apiBase = document.body.dataset.apiBase || "/api";
  const API_URL = `${apiBase}/comments`;
  const LIKE_API_URL = `${apiBase}/like`;
  const DEMO_KEY = "blog-guestbook-demo-comments";
  const NAME_KEY = "blog-comment-name";
  const LIKED_KEY = "blog-comment-likes";
  const form = document.getElementById("message-form");
  const nameInput = document.getElementById("message-name");
  const contentInput = document.getElementById("message-content");
  const contactInput = document.getElementById("message-contact");
  const publicContactInput = document.getElementById("message-public-contact");
  const contactPrivacy = document.getElementById("message-contact-privacy");
  const contactPanel = document.getElementById("message-contact-panel");
  const contactToggle = document.getElementById("message-contact-toggle");
  const status = document.getElementById("message-form-status");
  const list = document.getElementById("message-list");
  const count = document.getElementById("message-count");
  const submit = form.querySelector("button[type='submit']");
  let replyTarget = null;

  function readDemoComments() {
    try {
      const saved = localStorage.getItem(DEMO_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    const sample = document.getElementById("guestbook-sample");
    try { return JSON.parse(sample?.textContent || "{}").comments || []; } catch (_) { return []; }
  }

  function saveDemoComments(comments) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(comments)); } catch (_) {}
  }

  async function readResponse(response, fallback) {
    try {
      return await response.json();
    } catch (_) {
      throw new Error(fallback);
    }
  }

  try {
    nameInput.value = localStorage.getItem(NAME_KEY) || "";
  } catch (_) {
    // The page remains usable when browser storage is unavailable.
  }

  nameInput.addEventListener("change", function () {
    try {
      const name = nameInput.value.trim();
      if (name) localStorage.setItem(NAME_KEY, name);
      else localStorage.removeItem(NAME_KEY);
    } catch (_) {}
  });

  contactToggle.addEventListener("click", function () {
    const isOpen = contactToggle.getAttribute("aria-expanded") === "true";
    contactToggle.setAttribute("aria-expanded", String(!isOpen));
    contactPanel.setAttribute("aria-hidden", String(isOpen));
    contactPanel.classList.toggle("is-open", !isOpen);
    contactInput.tabIndex = isOpen ? -1 : 0;
    publicContactInput.tabIndex = isOpen ? -1 : 0;

    if (!isOpen) {
      window.setTimeout(() => contactInput.focus(), 400);
    } else {
      contactToggle.focus();
    }
  });

  publicContactInput.addEventListener("change", function () {
    contactPrivacy.replaceChildren();
    if (publicContactInput.checked) {
      contactPrivacy.textContent = "Contact information will be shown with your message";
    } else {
      const emphasis = document.createElement("strong");
      emphasis.className = "message-contact-privacy__emphasis";
      emphasis.textContent = "not";
      contactPrivacy.append("Contact information will ", emphasis, " be shown publicly");
    }
    contactPrivacy.classList.toggle("is-public", publicContactInput.checked);
  });

  function getLikedIds() {
    try {
      return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || "[]"));
    } catch (_) {
      return new Set();
    }
  }

  function saveLikedIds(ids) {
    try {
      localStorage.setItem(LIKED_KEY, JSON.stringify([...ids]));
    } catch (_) {}
  }

  function createLikeButton(comment) {
    let liked = getLikedIds().has(comment.id);
    let likeCount = comment.likes ?? 0;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "message-like";
    if (liked) button.classList.add("is-liked");

    const heart = document.createElement("span");
    heart.className = "message-like__heart";
    heart.setAttribute("aria-hidden", "true");
    heart.textContent = liked ? "\u2665" : "\u2661";

    const countEl = document.createElement("span");
    countEl.className = "message-like__count";
    countEl.textContent = String(likeCount);

    button.append(heart, countEl);
    button.setAttribute("aria-pressed", String(liked));

    function syncUI() {
      button.classList.toggle("is-liked", liked);
      button.setAttribute("aria-pressed", String(liked));
      heart.textContent = liked ? "\u2665" : "\u2661";
      countEl.textContent = String(likeCount);
    }

    button.addEventListener("click", function () {
      // 乐观更新：立即 +1 并点亮爱心，后台静默同步到数据库，不阻塞界面
      liked = !liked;
      likeCount += liked ? 1 : -1;
      if (likeCount < 0) likeCount = 0;
      syncUI();

      const ids = getLikedIds();
      if (liked) ids.add(comment.id);
      else ids.delete(comment.id);
      saveLikedIds(ids);

      if (mode !== "cloudflare") {
        const comments = readDemoComments();
        const stored = comments.find((item) => String(item.id) === String(comment.id));
        if (stored) stored.likes = likeCount;
        saveDemoComments(comments);
        return;
      }

      fetch(LIKE_API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ id: comment.id, liked }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data && typeof data.likes === "number") {
            likeCount = data.likes;
            syncUI();
          }
        })
        .catch(() => {
          // 网络失败时保留乐观界面，下次刷新会从服务端重新同步
        });
    });

    return button;
  }

  function formatTime(value) {
    const normalized = /Z$|[+-]\d\d:\d\d$/.test(value)
      ? value
      : `${value.replace(" ", "T")}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(document.documentElement.lang || "en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function renderComment(comment, replies) {
    const article = document.createElement("article");
    article.className = "message-card";

    const header = document.createElement("header");
    header.className = "message-card__header";
    const author = document.createElement("span");
    author.className = "message-card__author";
    author.textContent = comment.name;

    const identity = document.createElement("div");
    identity.className = "message-card__identity";
    identity.append(author);
    if (comment.contact) {
      const contact = document.createElement("span");
      contact.className = "message-card__contact";
      contact.textContent = comment.contact;
      identity.append(contact);
    }

    const time = document.createElement("time");
    time.className = "message-card__time";
    time.dateTime = comment.created_at;
    time.textContent = formatTime(comment.created_at);
    header.append(identity, time);

    const body = document.createElement("p");
    body.className = "message-card__content";
    body.textContent = comment.content;
    const actions = document.createElement("div");
    actions.className = "message-card__actions";
    const replyButton = document.createElement("button");
    replyButton.type = "button";
    replyButton.className = "message-card__reply-button";
    replyButton.textContent = "Reply";
    replyButton.addEventListener("click", function () {
      replyTarget = comment;
      form.querySelector(".message-reply-context")?.remove();
      const context = document.createElement("div");
      context.className = "message-reply-context";
      const label = document.createElement("span");
      label.textContent = `Replying to ${comment.name}`;
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", function () {
        replyTarget = null;
        context.remove();
      });
      context.append(label, cancel);
      contentInput.closest(".message-field").before(context);
      contentInput.focus();
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    actions.append(replyButton);
    actions.prepend(createLikeButton(comment));
    article.append(header, body, actions);

    if (replies.length) {
      const replyList = document.createElement("div");
      replyList.className = "message-card__replies";
      replies.forEach((reply) => replyList.append(renderReply(reply)));
      article.append(replyList);
    }
    return article;
  }

  function renderReply(reply) {
    const item = document.createElement("div");
    item.className = "message-reply";
    const meta = document.createElement("div");
    meta.className = "message-reply__meta";
    const author = document.createElement("strong");
    author.textContent = reply.name;
    const time = document.createElement("time");
    time.dateTime = reply.created_at;
    time.textContent = formatTime(reply.created_at);
    meta.append(author, time);
    const body = document.createElement("p");
    body.textContent = reply.content;
    const actions = document.createElement("div");
    actions.className = "message-reply__actions";
    actions.append(createLikeButton(reply));
    item.append(meta, body, actions);
    return item;
  }

  function renderComments(comments) {
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    count.textContent = `${comments.filter((comment) => !comment.parent_id).length} messages`;

    if (!comments.length) {
      const empty = document.createElement("p");
      empty.className = "message-list__notice";
      empty.textContent = "It is quiet here. Leave the first message.";
      list.append(empty);
      return;
    }
    const repliesByParent = new Map();
    comments.forEach((comment) => {
      if (!comment.parent_id) return;
      const replies = repliesByParent.get(comment.parent_id) || [];
      replies.push(comment);
      repliesByParent.set(comment.parent_id, replies);
    });
    comments
      .filter((comment) => !comment.parent_id)
      .forEach((comment) => list.append(renderComment(comment, repliesByParent.get(comment.id) || [])));
  }

  async function loadComments() {
    if (mode !== "cloudflare") {
      renderComments(readDemoComments());
      return;
    }
    try {
      const response = await fetch(API_URL, { headers: { accept: "application/json" } });
      const data = await readResponse(response, "留言暂时无法载入，请稍后再试。");
      if (!response.ok) throw new Error(data.error || "留言载入失败。");
      renderComments(data.comments || []);
    } catch (error) {
      list.setAttribute("aria-busy", "false");
      list.innerHTML = "";
      const notice = document.createElement("p");
      notice.className = "message-list__notice message-list__notice--error";
      notice.textContent = error.message;
      list.append(notice);
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    status.textContent = "";
    status.classList.remove("is-error", "is-success");

    if (!form.reportValidity()) return;
    submit.disabled = true;
    submit.textContent = "正在送出...";

    const fields = new FormData(form);
    const payload = Object.fromEntries(fields.entries());
    payload.public_contact = fields.get("public_contact") === "true";
    if (replyTarget) payload.parent_id = replyTarget.id;

    if (mode !== "cloudflare") {
      const comments = readDemoComments();
      comments.push({
        id: `demo-${Date.now()}`,
        name: payload.name.trim(), content: payload.content.trim(),
        contact: payload.public_contact ? payload.contact.trim() : "",
        parent_id: replyTarget?.id || null, likes: 0,
        created_at: new Date().toISOString()
      });
      saveDemoComments(comments);
      try { localStorage.setItem(NAME_KEY, payload.name.trim()); } catch (_) {}
      contentInput.value = "";
      status.textContent = replyTarget ? "Your reply has been added." : "Your message has been added.";
      status.classList.add("is-success");
      replyTarget = null;
      form.querySelector(".message-reply-context")?.remove();
      renderComments(comments);
      submit.disabled = false;
      submit.textContent = "Send message";
      return;
    }

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readResponse(response, "留言没有保存成功，请稍后再试。");
      if (!response.ok) throw new Error(data.error || "留言没有保存成功。");

      try {
        localStorage.setItem(NAME_KEY, payload.name.trim());
      } catch (_) {}

      contentInput.value = "";
      status.textContent = replyTarget ? "回复已经送出，谢谢你。" : "留言已经送出，谢谢你。";
      replyTarget = null;
      form.querySelector(".message-reply-context")?.remove();
      status.classList.add("is-success");
      await loadComments();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("is-error");
    } finally {
      submit.disabled = false;
      submit.textContent = "送出留言";
    }
  });

  loadComments();
})();
