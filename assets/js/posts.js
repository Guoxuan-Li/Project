(function () {
  "use strict";
  var root = document.querySelector("[data-post-browser]");
  if (!root) return;
  var input = root.querySelector("[data-post-search]");
  var cards = Array.prototype.slice.call(root.querySelectorAll("[data-post-card]"));
  var count = root.querySelector("[data-post-count]");
  var empty = root.querySelector("[data-post-empty]");

  function filter() {
    var terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;
    cards.forEach(function (card) {
      var text = [card.dataset.title, card.dataset.tags, card.dataset.body].join(" ").toLowerCase();
      var match = terms.every(function (term) { return text.indexOf(term) !== -1; });
      card.hidden = !match;
      if (match) shown++;
    });
    count.textContent = shown + " of " + cards.length + " articles";
    empty.hidden = shown !== 0;
  }
  input.addEventListener("input", filter);
  filter();
})();
