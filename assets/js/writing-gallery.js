(function () {
  "use strict";

  var source = document.querySelector(".writing-gallery-source");
  if (!source) return;

  document.addEventListener("DOMContentLoaded", function () {
    var works = Array.prototype.slice.call(source.querySelectorAll(":scope > .writing-work"));
    if (!works.length) return;

    var gallery = document.createElement("div");
    gallery.className = "writing-gallery";
    var list = document.createElement("div");
    list.className = "writing-gallery__list";
    var reader = document.createElement("article");
    reader.className = "writing-gallery__reader prose";
    reader.setAttribute("aria-live", "polite");
    gallery.appendChild(list);
    gallery.appendChild(reader);

    function openWork(work, card) {
      var title = work.querySelector(".writing-work__title");
      var meta = work.querySelector(".writing-work__meta");
      var body = work.querySelector(".writing-work__body");
      if (!title || !body) return;
      list.querySelectorAll(".writing-gallery__card").forEach(function (item) { item.classList.remove("is-active"); });
      card.classList.add("is-active");
      reader.innerHTML = "<header class=\"writing-gallery__reader-head\"><h2>" + title.innerHTML + "</h2>" + (meta ? "<span>" + meta.innerHTML + "</span>" : "") + "</header>" + body.innerHTML;
      var collapse = reader.querySelector(".writing-work__collapse");
      if (collapse) collapse.remove();
    }

    works.forEach(function (work, index) {
      var summary = work.querySelector(".writing-work__summary");
      var title = work.querySelector(".writing-work__title");
      var meta = work.querySelector(".writing-work__meta");
      var excerpt = work.querySelector(".writing-work__excerpt");
      if (!summary || !title) return;
      var card = document.createElement("button");
      card.type = "button";
      card.className = "writing-gallery__card";
      card.innerHTML = "<strong>" + title.innerHTML + "</strong>" + (excerpt ? "<span class=\"writing-gallery__excerpt\">" + excerpt.innerHTML + "</span>" : "") + (meta ? "<span>" + meta.innerHTML + "</span>" : "");
      card.addEventListener("click", function () { openWork(work, card); });
      list.appendChild(card);
      if (index === 0) openWork(work, card);
    });

    source.innerHTML = "";
    source.appendChild(gallery);
  });
}());
