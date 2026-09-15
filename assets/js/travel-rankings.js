(function () {
  "use strict";
  var button = document.querySelector("[data-ranking-open]");
  var source = document.getElementById("travel-ranking-source");
  if (!button || !source) return;

  function parse() {
    var groups = [];
    var current = null;
    Array.prototype.forEach.call(source.content.children, function (element) {
      if (element.tagName === "H1") { current = { title: element.textContent, tiers: [] }; groups.push(current); }
      else if (element.tagName === "H2" && current) current.tiers.push({ name: element.textContent, items: [] });
      else if (element.tagName === "P" && current && current.tiers.length) {
        element.textContent.split(/\s*=\s*|\n/).filter(Boolean).forEach(function (item) { current.tiers[current.tiers.length - 1].items.push(item.trim()); });
      }
    });
    return groups;
  }
  function open() {
    var groups = parse();
    var dialog = document.createElement("dialog");
    dialog.className = "ranking-dialog";
    dialog.innerHTML = '<div class="ranking-dialog__header"><div><p class="listing-header__eyebrow">Travel notebook</p><h2>Personal rankings</h2></div><button type="button" data-close aria-label="Close">&times;</button></div>' +
      '<div class="ranking-dialog__body"><div class="ranking-tabs">' + groups.map(function (g, i) { return '<button type="button" data-rank-tab="' + i + '" class="' + (i ? '' : 'is-active') + '">' + g.title + '</button>'; }).join('') + '</div><div data-rank-content></div></div>';
    function show(index) {
      var group = groups[index];
      dialog.querySelector("[data-rank-content]").innerHTML = '<div class="ranking-tiers">' + group.tiers.map(function (tier) {
        return '<section class="ranking-tier" data-tier="' + tier.name.toUpperCase() + '"><strong>' + tier.name + '</strong><div>' + tier.items.map(function (item, i) { return '<span><small>' + (i + 1) + '</small>' + item + '</span>'; }).join('') + '</div></section>';
      }).join('') + '</div>';
      dialog.querySelectorAll("[data-rank-tab]").forEach(function (tab) { tab.classList.toggle("is-active", Number(tab.dataset.rankTab) === index); });
    }
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog || event.target.closest("[data-close]")) dialog.close();
      var tab = event.target.closest("[data-rank-tab]"); if (tab) show(Number(tab.dataset.rankTab));
    });
    dialog.addEventListener("close", function () { dialog.remove(); });
    document.body.appendChild(dialog); show(0); dialog.showModal();
  }
  button.addEventListener("click", open);
})();
