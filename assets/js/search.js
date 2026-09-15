// ════════════════════════════════════════════════════════════
//   search.js -- Reusable search engine with chip/token locking
//
//   Features:
//   - Live filtering as you type
//   - Press Enter to lock a term into a chip (stack as many as you want)
//   - Click a chip to edit it back in the input
//   - Backspace (empty input) recalls the last chip
//   - Arrow keys move the insertion point between chips
//   - AND / OR operators between chips (click to toggle)
//   - Per-field scope toggles (search title only? body only? etc.)
//
//   Usage:
//     var engine = SearchEngine.create({
//       toolbar:   document.querySelector("[data-search-toolbar]"),
//       prefix:    "book",           // CSS class prefix
//       scopes:    ["title","author","summary"],
//       onFilter:  function(terms) { ... }   // called on every change
//     });
//     engine.init();
// ════════════════════════════════════════════════════════════

var SearchEngine = (function () {
  "use strict";

  function escapeReg(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightTerms(escapedHtml, terms) {
    var valid = terms.filter(Boolean).sort(function (a, b) { return b.length - a.length; });
    if (!valid.length) return escapedHtml;
    return escapedHtml.replace(
      new RegExp("(" + valid.map(escapeReg).join("|") + ")", "gi"),
      '<mark class="search-hit">$1</mark>'
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function buildMatchPreview(label, text, terms) {
    var lower = text.toLowerCase();
    var bestIdx = -1, bestTerm = "";
    terms.forEach(function (term) {
      var idx = lower.indexOf(term);
      if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
        bestIdx = idx; bestTerm = term;
      }
    });
    if (bestIdx < 0) return null;
    var radius = 42;
    var start = Math.max(0, bestIdx - radius);
    var end = Math.min(text.length, bestIdx + bestTerm.length + radius);
    var snippet = (start > 0 ? "... " : "") + text.slice(start, end) + (end < text.length ? " ..." : "");
    return { label: label, html: highlightTerms(escapeHtml(snippet), terms) };
  }

  function create(options) {
    var toolbar = options.toolbar;
    if (!toolbar) return null;

    var prefix = options.prefix || "listing";
    var scopeKeys = options.scopes || [];
    var onFilter = options.onFilter || function () {};

    var inputEl = toolbar.querySelector("[data-search-input]");
    var chipsEl = toolbar.querySelector("[data-search-chips]");
    var scopeEl = toolbar.querySelector("[data-search-scope]");
    var scopeLabelEl = toolbar.querySelector("[data-scope-label]");
    var countTotalEl = toolbar.querySelector("[data-count-total]");
    var countShownEl = toolbar.querySelector("[data-count-shown]");
    var searchEl = inputEl ? inputEl.closest("." + prefix + "-search") : null;
    var placeholder = inputEl ? inputEl.getAttribute("placeholder") : "";

    // State
    var chips = [];
    var chipOps = [];
    var insertionIndex = 0;
    var removingChip = false;
    var searchScopes = {};
    scopeKeys.forEach(function (k) { searchScopes[k] = true; });

    // ── Expression building ──────────────────────────────

    function activeTerms() {
      var raw = (inputEl.value || "").trim().split(/\s+/).filter(Boolean);
      return chips.concat(raw).map(function (t) { return t.toLowerCase(); }).filter(Boolean);
    }

    function expressionParts() {
      var rawTerms = (inputEl.value || "").trim().split(/\s+/).filter(Boolean)
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

    // ── Scope management ─────────────────────────────────

    function updateScopeLabel() {
      if (!scopeLabelEl) return;
      var names = [];
      scopeKeys.forEach(function (k) {
        if (searchScopes[k]) names.push(k);
      });
      scopeLabelEl.textContent = names.length === scopeKeys.length ? "All" : (names.length ? names.join(", ") : "None");
    }

    function setSearchScopes(keys) {
      scopeKeys.forEach(function (k) { searchScopes[k] = keys.indexOf(k) !== -1; });
      if (scopeEl) {
        scopeEl.querySelectorAll("[data-scope-field]").forEach(function (input) {
          input.checked = !!searchScopes[input.value];
        });
      }
      updateScopeLabel();
      onFilter(activeTerms());
    }

    function getActiveScopes() {
      return scopeKeys.filter(function (k) { return searchScopes[k]; });
    }

    // ── Chip rendering ───────────────────────────────────

    function removeChipAt(idx) {
      if (removingChip || idx < 0 || idx >= chips.length) return;
      removingChip = true;
      var chipEl = chipsEl.querySelector('[data-chip-index="' + idx + '"]');
      var opIndex = idx === 0 ? 0 : idx - 1;
      var opEl = chipsEl.querySelector('[data-op-index="' + opIndex + '"]');
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
        onFilter(activeTerms());
      }, 220);
    }

    function appendCaretSlot(position) {
      if (position === insertionIndex) {
        chipsEl.appendChild(inputEl);
        return;
      }
      var slot = document.createElement("button");
      slot.type = "button";
      slot.className = "chip-caret-slot";
      slot.setAttribute("aria-label", "Insert at position " + position);
      slot.addEventListener("click", function () {
        insertionIndex = position;
        renderChips(false);
        inputEl.focus();
      });
      chipsEl.appendChild(slot);
    }

    function renderChips(animateChips) {
      if (!chipsEl) return;
      var searchParent = chipsEl.parentNode;
      var keepFocus = document.activeElement === inputEl;
      searchParent.appendChild(inputEl);
      chipsEl.innerHTML = "";

      appendCaretSlot(0);
      chips.forEach(function (term, idx) {
        var chipEl = document.createElement("span");
        chipEl.className = animateChips === false ? "chip chip--static" : "chip";
        chipEl.dataset.chipIndex = String(idx);

        var termEl = document.createElement("button");
        termEl.type = "button";
        termEl.className = "chip__term";
        termEl.textContent = term;
        chipEl.appendChild(termEl);

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "chip__remove";
        removeBtn.setAttribute("aria-label", "Remove " + term);
        removeBtn.textContent = "\u00d7";
        removeBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          removeChipAt(idx);
        });
        chipEl.appendChild(removeBtn);

        // In-place edit
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
            else if (save && !value) { removeChipAt(idx); return; }
            else if (!save) chips[idx] = original;
            renderChips();
            onFilter(activeTerms());
          }
          edit.addEventListener("input", function () {
            chips[idx] = edit.value.trim();
            onFilter(activeTerms());
          });
          edit.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); finish(true); }
            else if (e.key === "Escape") { e.preventDefault(); finish(false); }
          });
          edit.addEventListener("blur", function () { finish(true); });
        }
        termEl.addEventListener("click", editChip);
        chipsEl.appendChild(chipEl);

        appendCaretSlot(idx + 1);
        if (idx < chips.length - 1) {
          var opIndex = idx;
          var op = document.createElement("button");
          op.type = "button";
          op.className = "chip-op chip-op--" + (chipOps[opIndex] || "and");
          op.textContent = (chipOps[opIndex] || "and").toUpperCase();
          op.title = "Toggle AND / OR";
          op.dataset.opIndex = String(opIndex);
          op.addEventListener("click", function () {
            chipOps[opIndex] = chipOps[opIndex] === "or" ? "and" : "or";
            renderChips(false);
            onFilter(activeTerms());
          });
          chipsEl.appendChild(op);
        }
      });

      if (!inputEl.parentNode || inputEl.parentNode !== chipsEl) chipsEl.appendChild(inputEl);
      inputEl.classList.toggle(prefix + "-search__input--inline", insertionIndex < chips.length);
      inputEl.setAttribute("placeholder", insertionIndex < chips.length ? "" : placeholder);
      inputEl.style.width = insertionIndex < chips.length
        ? Math.max(2, inputEl.value.length + 1) + "ch" : "";
      if (insertionIndex < chips.length && !inputEl.value) {
        var fixedPh = document.createElement("button");
        fixedPh.type = "button";
        fixedPh.className = prefix + "-search__fixed-placeholder";
        fixedPh.textContent = placeholder;
        fixedPh.addEventListener("click", function () {
          insertionIndex = chips.length;
          renderChips(false);
          inputEl.focus();
        });
        chipsEl.appendChild(fixedPh);
      }
      if (keepFocus) inputEl.focus();
    }

    // ── Event binding ────────────────────────────────────

    function bindEvents() {
      inputEl.addEventListener("input", function () {
        if (insertionIndex < chips.length) {
          inputEl.style.width = Math.max(2, inputEl.value.length + 1) + "ch";
        }
        onFilter(activeTerms());
      });

      inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopImmediatePropagation();
          var value = inputEl.value.trim();
          if (!value) return;
          if (chips.indexOf(value) === -1) {
            if (!chips.length) { chips.push(value); }
            else if (insertionIndex === 0) { chips.unshift(value); chipOps.unshift("and"); }
            else if (insertionIndex >= chips.length) { chips.push(value); chipOps.push("and"); }
            else { chips.splice(insertionIndex, 0, value); chipOps.splice(insertionIndex - 1, 0, "and"); }
            insertionIndex++;
          }
          inputEl.value = "";
          renderChips();
          onFilter(activeTerms());
        } else if (e.key === "Backspace" && inputEl.value === "" && chips.length > 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (insertionIndex > 0) removeChipAt(insertionIndex - 1);
        } else if (e.key === "ArrowLeft" && inputEl.value === "" && insertionIndex > 0) {
          e.preventDefault(); e.stopImmediatePropagation();
          insertionIndex--; renderChips(false); inputEl.focus();
        } else if (e.key === "ArrowRight" && inputEl.value === "" && insertionIndex < chips.length) {
          e.preventDefault(); e.stopImmediatePropagation();
          insertionIndex++; renderChips(false); inputEl.focus();
        }
      }, true);

      if (searchEl) {
        searchEl.addEventListener("click", function (e) {
          if (e.target !== searchEl && e.target !== chipsEl) return;
          insertionIndex = chips.length;
          renderChips(false);
          inputEl.focus();
        });
      }

      if (scopeEl) {
        scopeEl.addEventListener("change", function () {
          var checked = Array.prototype.slice.call(
            scopeEl.querySelectorAll("[data-scope-field]:checked")
          ).map(function (input) { return input.value; });
          setSearchScopes(checked);
        });
        scopeEl.addEventListener("click", function (e) {
          var action = e.target.closest("[data-scope-action]");
          if (!action) return;
          setSearchScopes(action.dataset.scopeAction === "all" ? scopeKeys.slice() : []);
        });
        document.addEventListener("click", function (e) {
          if (scopeEl.open && !scopeEl.contains(e.target)) scopeEl.open = false;
        });
      }
    }

    // ── Public API ───────────────────────────────────────

    function init() {
      if (!inputEl) return;
      if (scopeKeys.length) updateScopeLabel();
      renderChips(false);
      bindEvents();
      inputEl.setAttribute("placeholder", placeholder);
    }

    function setCount(total, shown) {
      if (countTotalEl) countTotalEl.textContent = total;
      if (countShownEl) countShownEl.textContent = shown;
    }

    return {
      init: init,
      activeTerms: activeTerms,
      matchesSearch: matchesSearch,
      getActiveScopes: getActiveScopes,
      searchScopes: searchScopes,
      setCount: setCount,
      highlightTerms: highlightTerms,
      buildMatchPreview: buildMatchPreview,
      escapeHtml: escapeHtml,
      inputEl: inputEl,
      hideLoading: function () {
        var el = document.getElementById("page-loading");
        if (el) el.classList.add("page-loading--hidden");
      }
    };
  }

  return { create: create };
})();

// Expose globally for non-modular usage
if (typeof window !== "undefined") window.SearchEngine = SearchEngine;