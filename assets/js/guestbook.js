(function () {
  "use strict";
  var section = document.querySelector("[data-guestbook-api]");
  var list = document.getElementById("guestbook-list");
  var reload = document.getElementById("guestbook-reload");
  if (!section || !list || !reload) return;

  function safeUrl(value) {
    try { var url = new URL(value); return url.protocol === "https:" ? url.href : ""; }
    catch (_) { return ""; }
  }
  function status(message) {
    list.replaceChildren();
    var note = document.createElement("p");
    note.className = "guestbook-status";
    note.textContent = message;
    list.appendChild(note);
  }
  function card(comment) {
    var article = document.createElement("article");
    article.className = "guestbook-card";
    var header = document.createElement("div");
    header.className = "guestbook-card__header";
    var avatar = document.createElement("img");
    avatar.className = "guestbook-card__avatar";
    avatar.src = safeUrl(comment.user && comment.user.avatar_url) || "";
    avatar.alt = "";
    avatar.loading = "lazy";
    var identity = document.createElement("div");
    var name = document.createElement("strong");
    name.textContent = comment.user && comment.user.login || "GitHub 访客";
    var time = document.createElement("time");
    time.dateTime = comment.created_at || "";
    time.textContent = comment.created_at ? new Intl.DateTimeFormat("zh-CN", {year:"numeric",month:"long",day:"numeric"}).format(new Date(comment.created_at)) : "";
    identity.append(name, time);
    header.append(avatar, identity);
    var body = document.createElement("p");
    body.className = "guestbook-card__body";
    body.textContent = comment.body || "";
    var link = document.createElement("a");
    link.href = safeUrl(comment.html_url) || "https://github.com/Guoxuan-Li/Project/issues/1";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "回复 ↗";
    article.append(header, body, link);
    return article;
  }
  async function load() {
    reload.disabled = true;
    list.setAttribute("aria-busy", "true");
    status("正在读取留言…");
    try {
      var response = await fetch(section.dataset.guestbookApi + "?per_page=100&sort=created&direction=desc", {headers:{Accept:"application/vnd.github+json"}, cache:"no-store"});
      if (!response.ok) throw new Error("GitHub API " + response.status);
      var comments = await response.json();
      list.replaceChildren();
      if (!comments.length) status("还没有留言。欢迎留下第一句话！");
      else comments.forEach(function (comment) { list.appendChild(card(comment)); });
    } catch (_) {
      status("暂时读取不到留言。可以点击上方的 GitHub 链接查看或留言。");
    } finally {
      list.setAttribute("aria-busy", "false");
      reload.disabled = false;
    }
  }
  reload.addEventListener("click", load);
  load();
})();
