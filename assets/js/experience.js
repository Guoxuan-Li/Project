// 经历页面
// 1. 点击标题行展开/收起项目经验（h2）
// 2. 每个项目根据标题+内容+序号哈希，随机分配一个淡色
//    如果和上一个项目同色则顺延一位，保证相邻不撞色

(function () {
  "use strict";

  var palette = [
    { accent: "var(--sakura)",  ink: "var(--sakura-ink)" },
    { accent: "var(--sora)",    ink: "var(--sora-ink)" },
    { accent: "var(--matcha)",  ink: "var(--matcha-ink)" },
    { accent: "var(--yuzu)",    ink: "var(--yuzu-ink)" },
    { accent: "var(--sumire)",  ink: "var(--sumire-ink)" },
  ];

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function assignProjectColors() {
    var projects = document.querySelectorAll(".project");
    var lastIdx = -1;
    projects.forEach(function (project, idx) {
      var title = (project.querySelector(".project__title") || {}).textContent || "";
      var content = (project.querySelector(".project__content") || {}).textContent || "";
      var key = title + content + idx;
      var slot = hashStr(key) % palette.length;

      // 和上一个同色就顺延一位
      if (slot === lastIdx) {
        slot = (slot + 1) % palette.length;
      }
      lastIdx = slot;

      var c = palette[slot];
      project.style.setProperty("--project-accent", c.accent);
      project.style.setProperty("--project-ink", c.ink);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var timeline = document.querySelector(".timeline");
    if (!timeline) return;

    timeline.querySelectorAll(".timeline__toggle").forEach(function (btn) {
      var row = btn.closest(".timeline__title-row");
      row.addEventListener("click", function () {
        var item = btn.closest(".timeline__item");
        var isOpen = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!isOpen));
        item.classList.toggle("is-open", !isOpen);
      });
    });

    assignProjectColors();
  });
})();
