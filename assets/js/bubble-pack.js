(function (global) {
  "use strict";

  function pack(items, initialWidth, initialHeight, gap) {
    var placeWidth = initialWidth;
    var placeHeight = initialHeight;
    var packed = [];
    var attempts = 0;
    var spacing = gap == null ? 2 : gap;

    while (true) {
      packed = items.map(function (item) {
        return Object.assign({}, item, { x: 0, y: 0 });
      });
      var centerX = placeWidth / 2;
      var centerY = placeHeight / 2;
      var placed = [];
      var allFit = true;

      for (var bubbleIndex = 0; bubbleIndex < packed.length; bubbleIndex++) {
        var bubble = packed[bubbleIndex];
        if (!placed.length) {
          bubble.x = centerX;
          bubble.y = centerY;
          placed.push(bubble);
          continue;
        }
        var best = null;
        var bestDistance = Infinity;
        var searchMax = Math.max(placeWidth, placeHeight) * 1.5;
        for (var angle = 0; angle < Math.PI * 2; angle += 0.08) {
          for (var distance = 3; distance < searchMax; distance += 1.5) {
            var x = centerX + Math.cos(angle) * distance;
            var y = centerY + Math.sin(angle) * distance;
            var available = true;
            for (var placedIndex = 0; placedIndex < placed.length; placedIndex++) {
              var other = placed[placedIndex];
              var dx = x - other.x;
              var dy = y - other.y;
              var minimumDistance = bubble.radius + other.radius + spacing;
              if (dx * dx + dy * dy < minimumDistance * minimumDistance) {
                available = false;
                break;
              }
            }
            if (available && x - bubble.radius > 2 && x + bubble.radius < placeWidth - 2 && y - bubble.radius > 2 && y + bubble.radius < placeHeight - 2 && distance < bestDistance) {
              bestDistance = distance;
              best = { x: x, y: y };
            }
          }
        }
        if (!best) {
          allFit = false;
          break;
        }
        bubble.x = best.x;
        bubble.y = best.y;
        placed.push(bubble);
      }

      if (allFit || attempts > 20) break;
      placeWidth = Math.round(placeWidth * 1.4);
      placeHeight = Math.round(placeHeight * 1.4);
      attempts++;
    }

    if (packed.length) {
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      packed.forEach(function (bubble) {
        minX = Math.min(minX, bubble.x - bubble.radius);
        maxX = Math.max(maxX, bubble.x + bubble.radius);
        minY = Math.min(minY, bubble.y - bubble.radius);
        maxY = Math.max(maxY, bubble.y + bubble.radius);
      });
      var shiftX = placeWidth / 2 - (minX + maxX) / 2;
      var shiftY = placeHeight / 2 - (minY + maxY) / 2;
      shiftX = Math.max(2 - minX, Math.min(placeWidth - 2 - maxX, shiftX));
      shiftY = Math.max(2 - minY, Math.min(placeHeight - 2 - maxY, shiftY));
      packed.forEach(function (bubble) {
        bubble.x += shiftX;
        bubble.y += shiftY;
      });
    }

    return { items: packed, width: placeWidth, height: placeHeight };
  }

  global.BubblePack = { pack: pack };
})(window);
