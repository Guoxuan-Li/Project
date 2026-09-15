(function () {
  "use strict";

  const network = document.getElementById("friend-network");
  if (!network) return;

  const canvas = document.getElementById("friend-network-canvas");
  const context = canvas.getContext("2d");
  const people = Array.from(network.querySelectorAll(".friend-bubble--person"));
  const self = network.querySelector(".friend-bubble--self");
  const initialSelfAria = self.getAttribute("aria-label") || "Your location";
  const bubbles = [self, ...people];
  const toast = document.getElementById("friend-toast");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileLayout = window.matchMedia("(max-width: 560px)");
  const accents = ["sora", "matcha", "yuzu", "sumire"];
  const maxDrift = 6;
  const maxDriftSpeed = 0.00032;
  const orbitSpeed = 0.00015;
  const minOrbitSpeed = 0.14;
  const proximityRadius = 175;
  const minNudgeDistance = 7;
  const maxNudgeDistance = 18;
  const nudgeSpeedCurve = 1.2;
  const nudgeInfluenceScale = 1.1;
  const nudgeResponse = 150;
  const trailPoints = 32;
  const trailWidthRatio = 1.25;
  const nodes = [];
  const baseDiameters = new Map(bubbles.map((bubble) => [bubble, bubble.offsetWidth]));
  const minDepthScale = 0.52;
  const maxDepthScale = 1.38;
  let center = { x: 0, y: 0 };
  let orbitOffset = 0;
  let orbitSpeedScale = 1;
  let targetOrbitSpeedScale = 1;
  let lastFrameTime = 0;
  let animationFrame = 0;
  let toastTimer = 0;
  let activeHintBubble = null;
  let width = 0;
  let height = 0;
  let displayedPeople = people.slice();
  let mobileFlipStartedAt = 0;
  let mobileFlipSwapped = false;
  let mobileFlipScale = 1;
  const pointer = { x: 0, y: 0, active: false, hasPosition: false, lastTime: 0 };
  const selfNudge = {
    x: 0, y: 0, targetX: 0, targetY: 0,
    directionX: 0, directionY: 0, peakDistance: 0, inside: false
  };

  function seedFor(text) {
    let hash = 2166136261;
    Array.from(text).forEach((character) => {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return hash >>> 0;
  }

  function colorFrom(element, property) {
    return getComputedStyle(element).getPropertyValue(property).trim();
  }

  function position(node, angle, origin) {
    const orbitX = Math.cos(angle) * node.rx * node.radiusScale;
    const orbitY = Math.sin(angle) * node.ry * Math.cos(node.tilt) * node.radiusScale;
    return {
      x: origin.x + orbitX * Math.cos(node.rotation) - orbitY * Math.sin(node.rotation),
      y: origin.y + orbitX * Math.sin(node.rotation) + orbitY * Math.cos(node.rotation),
      depth: Math.sin(angle) * Math.sin(node.tilt)
    };
  }

  function roundedText(text, x, y, maxWidth, fontSize, color) {
    context.fillStyle = color;
    context.font = `500 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y, maxWidth);
  }

  function trailStartAngle(node, angle, origin, widthScale) {
    const coveredLength = baseDiameters.get(node.element) * widthScale / 2;
    const angleStep = 0.012;
    let travelled = 0;
    let cursor = angle;
    let previous = position(node, cursor, origin);
    while (travelled < coveredLength && angle - cursor < Math.PI / 2) {
      cursor -= angleStep;
      const point = position(node, cursor, origin);
      travelled += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
    return cursor - node.trailSpan;
  }

  function trailOutline(node, startAngle, angle, origin, widthScale, padding = 0) {
    const points = Array.from({ length: trailPoints }, (_, index) => {
      const pointAngle = startAngle + (angle - startAngle) * index / (trailPoints - 1);
      return position(node, pointAngle, origin);
    });
    const edges = points.map((point, index) => {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const tangentX = next.x - previous.x;
      const tangentY = next.y - previous.y;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      const progress = index / (points.length - 1);
      const halfWidth = (0.25 + Math.pow(progress, 0.82) * 1.4)
        * widthScale * trailWidthRatio + padding;
      const normalX = -tangentY / tangentLength * halfWidth;
      const normalY = tangentX / tangentLength * halfWidth;
      return {
        outer: { x: point.x + normalX, y: point.y + normalY },
        inner: { x: point.x - normalX, y: point.y - normalY }
      };
    });
    return [...edges.map((edge) => edge.outer), ...edges.reverse().map((edge) => edge.inner)];
  }

  function drawTrail(node, angle, origin, widthScale) {
    const startAngle = trailStartAngle(node, angle, origin, widthScale);
    const halo = trailOutline(node, startAngle, angle, origin, widthScale, 4);
    const outline = trailOutline(node, startAngle, angle, origin, widthScale);
    const gradientStart = position(node, startAngle, origin);
    const gradientEnd = position(node, angle, origin);
    const gradient = context.createLinearGradient(
      gradientStart.x, gradientStart.y, gradientEnd.x, gradientEnd.y
    );
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(0, node.transparentInk);
    gradient.addColorStop(0.24, node.ink12);
    gradient.addColorStop(0.52, node.ink42);
    gradient.addColorStop(1, node.ink78);
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    halo.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.fillStyle = "#000";
    context.fill();
    context.restore();

    context.beginPath();
    outline.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
  }

  function drawBubble(node, x, y, radius, active, perspectiveScale, flipScale = 1) {
    context.save();
    context.translate(0, y);
    context.scale(1, flipScale);
    context.translate(0, -y);
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(x, y, radius + 7, 0, Math.PI * 2);
    context.fillStyle = "#000";
    context.fill();
    context.restore();

    context.save();
    context.shadowColor = node.ink + (active ? "38" : "20");
    context.shadowBlur = active ? 24 : 10 + Math.pow(node.depthRatio || 0.5, 1.25) * 24;
    context.shadowOffsetY = active ? 8 : 3 + Math.pow(node.depthRatio || 0.5, 1.25) * 10;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = active ? node.color : node.soft;
    context.fill();
    context.shadowColor = "transparent";
    context.strokeStyle = node.ink + (active ? "55" : "32");
    context.lineWidth = 1;
    context.stroke();
    roundedText(
      node.label,
      x,
      y + (node.subtitle ? -7 : 0),
      radius * 1.55,
      Math.max(10, node.baseFontSize * perspectiveScale * node.crowdScale),
      active ? node.surface : node.ink
    );
    if (node.subtitle) {
      roundedText(node.subtitle, x, y + 15, radius * 1.7, 10, active ? node.surface : node.ink);
    }
    context.restore();
    context.restore();
  }

  function nextMobileBatch() {
    const current = new Set(displayedPeople);
    const candidates = people.filter((person) => !current.has(person));
    const shuffle = (items) => items
      .map((person) => ({ person, order: Math.random() }))
      .sort((a, b) => a.order - b.order)
      .map((item) => item.person);
    const pool = [...shuffle(candidates), ...shuffle(people.filter((person) => current.has(person)))];
    return pool.slice(0, Math.min(3, people.length));
  }

  function switchMobileBatch() {
    if (!mobileLayout.matches || people.length <= 3 || mobileFlipStartedAt) return;
    mobileFlipStartedAt = performance.now();
    mobileFlipSwapped = false;
    network.classList.add("friend-network--switching");
    self.setAttribute("aria-label", "Showing more friends");
  }

  function layout() {
    width = network.clientWidth;
    height = network.clientHeight;
    center = { x: width / 2, y: height / 2 };
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const compact = mobileLayout.matches;
    self.setAttribute("aria-label", compact && people.length > 3 ? "Show more friends" : initialSelfAria);
    displayedPeople = compact ? displayedPeople.slice(0, 3) : people.slice();
    people.forEach((person) => { person.hidden = !displayedPeople.includes(person); });
    const count = displayedPeople.length;
    const crowdScale = count >= 16 ? 0.68 : count >= 12 ? 0.74 : count >= 9 ? 0.8 : count >= 7 ? 0.86 : count >= 5 ? 0.92 : 1;
    const layerCount = count >= 9 ? 3 : count >= 5 ? 2 : 0;
    const baseRx = Math.max(105, width * (compact ? 0.34 : 0.38));
    const baseRy = Math.max(105, height * (compact ? 0.3 : 0.34));
    network.style.setProperty("--friend-size-scale", crowdScale);
    nodes.length = 0;

    let lastAccentIndex = -1;
    displayedPeople.forEach((element, index) => {
      const seed = seedFor(element.textContent.trim());
      let accentIndex = seed % accents.length;
      if (accentIndex === lastAccentIndex) accentIndex = (accentIndex + 1) % accents.length;
      lastAccentIndex = accentIndex;
      const accent = accents[accentIndex];
      element.classList.remove(...accents.map((name) => `friend-bubble--${name}`));
      element.classList.add(`friend-bubble--${accent}`);
      const layered = !compact && layerCount > 0;
      const layer = layered ? index % layerCount : index;
      const slot = layered ? Math.floor(index / layerCount) : index;
      const population = layered ? Math.floor((count - 1 - layer) / layerCount) + 1 : count;
      const angularGap = Math.PI * 2 / population;
      const angleJitter = (((seed >>> 8) % 1000) / 1000 - 0.5) * angularGap * 0.05;
      const shellPosition = layered ? layer / (layerCount - 1) : count === 1 ? 0.5 : index / (count - 1);
      const radiusJitter = ((seed % 1000) / 1000 - 0.5) * 0.012;
      const layerRadii = layerCount === 2
        ? compact ? [0.68, 1.1] : [0.62, 1.12]
        : compact ? [0.6, 0.87, 1.15] : [0.5, 0.82, 1.16];
      const radiusFactor = layered
        ? layerRadii[layer] + radiusJitter
        : 0.5 + Math.pow(shellPosition, 0.85) * 0.68 + radiusJitter;
      const mobileAngles = [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6];
      const angle = compact ? mobileAngles[index] : -Math.PI / 2 + Math.PI * 2 * slot / population
        + (layered ? layer * 0.06 : 0) + angleJitter;
      const node = {
        element,
        label: element.textContent.trim(),
        angle,
        rx: compact ? Math.min(126, width * 0.34) : baseRx * radiusFactor,
        ry: compact ? Math.min(142, height * 0.31) : baseRy * radiusFactor * (0.94 + shellPosition * 0.08),
        tilt: compact ? 0 : 0.47 + shellPosition * 0.025,
        rotation: compact ? 0 : -0.19 + shellPosition * 0.035,
        radiusScale: 1,
        trailSpan: compact ? 0.58 : Math.min(1.28, angularGap * 0.62),
        crowdScale: compact ? 1 : crowdScale,
        baseRadius: baseDiameters.get(element) * crowdScale / 2,
        baseFontSize: parseFloat(getComputedStyle(element).fontSize),
        phase: index * 1.73 + ((seed >>> 4) % 100) / 125,
        driftSpeed: Math.min(maxDriftSpeed, 0.00022 + (index % 4) * 0.000025),
        amplitude: Math.min(maxDrift, 4 + (index % 3)),
        nudge: {
          x: 0, y: 0, targetX: 0, targetY: 0,
          directionX: 0, directionY: 0, peakDistance: 0, inside: false
        },
        anchor: null,
        currentRadius: 0,
        color: colorFrom(element, "--bubble-color"),
        soft: colorFrom(element, "--bubble-soft"),
        ink: colorFrom(element, "--bubble-ink"),
        surface: colorFrom(document.documentElement, "--surface") || "#fff"
      };
      node.transparentInk = colorWithAlpha(node.ink, 0);
      node.ink12 = colorWithAlpha(node.ink, 0.12);
      node.ink42 = colorWithAlpha(node.ink, 0.42);
      node.ink78 = colorWithAlpha(node.ink, 0.78);
      const maxRadius = node.baseRadius * maxDepthScale + 10;
      node.radiusScale = Math.min(1, Math.max(0.48, (center.x - maxRadius) / node.rx), Math.max(0.48, (center.y - maxRadius) / node.ry));
      nodes.push(node);
    });

    const selfRadius = baseDiameters.get(self) * crowdScale / 2;
    self.dataset.canvasRadius = selfRadius;
    draw(performance.now());
  }

  function placeHitArea(element, x, y, radius, depth, anchor = { x, y }) {
    const left = Math.min(x, anchor.x) - radius;
    const right = Math.max(x, anchor.x) + radius;
    const top = Math.min(y, anchor.y) - radius;
    const bottom = Math.max(y, anchor.y) + radius;
    element.style.left = `${(left + right) / 2}px`;
    element.style.top = `${(top + bottom) / 2}px`;
    element.style.width = `${right - left}px`;
    element.style.height = `${bottom - top}px`;
    element.style.aspectRatio = "auto";
    element.style.borderRadius = `${radius}px`;
    element.style.zIndex = `${11 + Math.round(depth * 20)}`;
  }

  function colorWithAlpha(color, alpha) {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      return `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
    }
    return color;
  }

  function nudgeOffset(state, delta) {
    const response = 1 - Math.exp(-delta / nudgeResponse);
    state.x += (state.targetX - state.x) * response;
    state.y += (state.targetY - state.y) * response;
    return state;
  }

  function nudgeStrength(distance, radius) {
    if (distance <= radius) return 1;
    const influenceRadius = radius * nudgeInfluenceScale;
    const progress = Math.max(0, 1 - (distance - radius) / (influenceRadius - radius));
    return progress * progress * (3 - 2 * progress);
  }

  function updateNudgeDistance(state, anchor, radius) {
    if (!pointer.active || !anchor || !radius || !state.inside) return;
    const distance = Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y);
    const insideInfluence = distance <= radius * nudgeInfluenceScale;
    if (!insideInfluence) {
      state.targetX = 0;
      state.targetY = 0;
      state.inside = false;
      return;
    }
    const strength = nudgeStrength(distance, radius);
    state.targetX = state.directionX * state.peakDistance * strength;
    state.targetY = state.directionY * state.peakDistance * strength;
  }

  function draw(time) {
    if (mobileFlipStartedAt) {
      const duration = reduceMotion.matches ? 1 : 560;
      const progress = Math.min(1, (time - mobileFlipStartedAt) / duration);
      mobileFlipScale = Math.abs(1 - progress * 2);
      if (progress >= 0.5 && !mobileFlipSwapped) {
        mobileFlipSwapped = true;
        displayedPeople = nextMobileBatch();
        layout();
        return;
      }
      if (progress >= 1) {
        mobileFlipStartedAt = 0;
        mobileFlipScale = 1;
        network.classList.remove("friend-network--switching");
        self.setAttribute("aria-label", mobileLayout.matches ? "Show more friends" : initialSelfAria);
      }
    }
    context.clearRect(0, 0, width, height);
    const still = reduceMotion.matches;
    const delta = lastFrameTime ? Math.min(40, time - lastFrameTime) : 0;
    lastFrameTime = time;
    orbitSpeedScale += (targetOrbitSpeedScale - orbitSpeedScale) * Math.min(1, delta / 180);
    if (!still) orbitOffset += delta * orbitSpeed * orbitSpeedScale;
    const origin = {
      x: center.x + (still ? 0 : Math.sin(time * 0.00018) * 3),
      y: center.y + (still ? 0 : Math.cos(time * 0.00015) * 2.2)
    };

    const renderNodes = nodes.map((node) => {
      const angle = node.angle + orbitOffset;
      const point = position(node, angle, origin);
      const depthRatio = (point.depth + 1) / 2;
      const scale = minDepthScale + Math.pow(depthRatio, 1.25) * (maxDepthScale - minDepthScale);
      const driftX = still ? 0 : Math.sin(time * node.driftSpeed + node.phase) * node.amplitude;
      const driftY = still ? 0 : Math.cos(time * node.driftSpeed * 0.83 + node.phase * 1.4) * node.amplitude * 0.72;
      const anchor = { x: point.x + driftX, y: point.y + driftY };
      const nudge = nudgeOffset(node.nudge, delta);
      node.anchor = anchor;
      node.currentRadius = node.baseRadius * scale;
      updateNudgeDistance(node.nudge, anchor, node.currentRadius);
      return {
        node,
        angle,
        point: { x: anchor.x + nudge.x, y: anchor.y + nudge.y },
        trailOrigin: origin,
        depthRatio,
        scale,
        radius: node.baseRadius * scale
      };
    }).sort((a, b) => a.depthRatio - b.depthRatio);

    const selfNode = {
      label: self.textContent.trim(),
      subtitle: mobileLayout.matches && people.length > 3 ? "看看其他星星？" : "",
      crowdScale: 1,
      baseFontSize: parseFloat(getComputedStyle(self).fontSize),
      color: colorFrom(self, "--bubble-color"),
      soft: colorFrom(self, "--bubble-soft"),
      ink: colorFrom(self, "--bubble-ink"),
      surface: colorFrom(document.documentElement, "--surface") || "#fff"
    };
    const selfRadius = Number(self.dataset.canvasRadius);
    const selfPull = nudgeOffset(selfNudge, delta);
    selfNudge.anchor = origin;
    selfNudge.currentRadius = selfRadius;
    updateNudgeDistance(selfNudge, origin, selfRadius);
    const selfPoint = { x: origin.x + selfPull.x, y: origin.y + selfPull.y };
    updateOrbitSpeedFromPositions(renderNodes, selfPoint);
    const drawItem = (item) => {
      item.node.depthRatio = item.depthRatio;
      drawTrail(item.node, item.angle, item.trailOrigin, item.scale * item.node.crowdScale);
      drawBubble(
        item.node,
        item.point.x,
        item.point.y,
        item.radius,
        item.node.element.matches(":hover, :focus-visible"),
        item.scale,
        mobileLayout.matches ? mobileFlipScale : 1
      );
      placeHitArea(
        item.node.element,
        item.point.x,
        item.point.y,
        item.radius * nudgeInfluenceScale,
        item.depthRatio,
        item.node.anchor
      );
    };
    renderNodes.filter((item) => item.depthRatio < 0.5).forEach(drawItem);
    drawBubble(selfNode, selfPoint.x, selfPoint.y, selfRadius, self.matches(":hover, :focus-visible"), 1);
    placeHitArea(
      self,
      selfPoint.x,
      selfPoint.y,
      selfRadius * nudgeInfluenceScale,
      0.45,
      origin
    );
    renderNodes.filter((item) => item.depthRatio >= 0.5).forEach(drawItem);
  }

  function animate(time) {
    draw(time);
    animationFrame = requestAnimationFrame(animate);
  }

  function positionHint(event, bubble) {
    if (!event || typeof event.clientX !== "number") {
      const rect = bubble ? bubble.getBoundingClientRect() : null;
      if (!rect) return;
      event = {
        clientX: rect.right,
        clientY: rect.top + rect.height / 2
      };
    }
    const left = Math.min(window.innerWidth - (toast.offsetWidth || 180) - 12, event.clientX + 14);
    const top = Math.min(window.innerHeight - (toast.offsetHeight || 40) - 12, event.clientY + 14);
    toast.style.left = `${Math.max(12, left)}px`;
    toast.style.top = `${Math.max(12, top)}px`;
    toast.style.bottom = "auto";
  }

  function showHint(message, bubble, event) {
    const alreadyVisible = !toast.hidden
      && activeHintBubble === bubble
      && toast.textContent === message
      && toast.classList.contains("friend-toast--show");
    toast.textContent = message;
    toast.style.setProperty("--hint-accent", colorFrom(bubble, "--bubble-color"));
    toast.style.setProperty("--hint-soft", colorFrom(bubble, "--bubble-soft"));
    toast.style.setProperty("--hint-ink", colorFrom(bubble, "--bubble-ink"));
    toast.hidden = false;
    positionHint(event, bubble);
    clearTimeout(toastTimer);
    if (alreadyVisible) return;
    activeHintBubble = bubble;
    toast.classList.remove("friend-toast--show");
    requestAnimationFrame(() => toast.classList.add("friend-toast--show"));
  }

  function hideHint() {
    activeHintBubble = null;
    toast.classList.remove("friend-toast--show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 220);
  }

  function updateOrbitSpeedFromPositions(renderNodes, selfPoint) {
    if (!pointer.active) {
      targetOrbitSpeedScale = 1;
      return;
    }
    const nearestDistance = renderNodes.reduce((nearest, item) => {
      return Math.min(nearest, Math.hypot(pointer.x - item.point.x, pointer.y - item.point.y));
    }, Math.hypot(pointer.x - selfPoint.x, pointer.y - selfPoint.y));
    const proximity = Math.max(0, 1 - nearestDistance / proximityRadius);
    const eased = proximity * (2 - proximity);
    targetOrbitSpeedScale = 1 - eased * (1 - minOrbitSpeed);
  }

  function updatePointer(event) {
    const rect = network.getBoundingClientRect();
    const nextX = event.clientX - rect.left;
    const nextY = event.clientY - rect.top;
    const movementX = pointer.hasPosition ? nextX - pointer.x : 0;
    const movementY = pointer.hasPosition ? nextY - pointer.y : 0;
    const movementLength = Math.hypot(movementX, movementY);
    const eventTime = event.timeStamp || performance.now();
    const elapsed = pointer.lastTime ? Math.max(8, Math.min(64, eventTime - pointer.lastTime)) : 16;
    const pointerSpeed = movementLength / elapsed;
    const speedProgress = 1 - Math.exp(-pointerSpeed / nudgeSpeedCurve);
    const nudgeDistance = minNudgeDistance
      + (maxNudgeDistance - minNudgeDistance) * speedProgress;
    const directionX = movementLength > 0.5 ? movementX / movementLength : 0;
    const directionY = movementLength > 0.5 ? movementY / movementLength : 0;
    const applyNudge = (state, anchor, radius) => {
      if (!anchor || !radius) return;
      const distance = Math.hypot(nextX - anchor.x, nextY - anchor.y);
      const inside = distance <= radius * nudgeInfluenceScale;
      if (inside && !state.inside && movementLength > 0.5) {
        state.directionX = directionX;
        state.directionY = directionY;
        state.peakDistance = nudgeDistance;
        const strength = nudgeStrength(distance, radius);
        state.targetX = directionX * nudgeDistance * strength;
        state.targetY = directionY * nudgeDistance * strength;
      } else if (inside && state.inside) {
        const strength = nudgeStrength(distance, radius);
        state.targetX = state.directionX * state.peakDistance * strength;
        state.targetY = state.directionY * state.peakDistance * strength;
      } else if (!inside && state.inside) {
        state.targetX = 0;
        state.targetY = 0;
      }
      if (!inside) state.inside = false;
      else if (movementLength > 0.5) state.inside = true;
    };
    nodes.forEach((node) => applyNudge(node.nudge, node.anchor, node.currentRadius));
    applyNudge(selfNudge, selfNudge.anchor, selfNudge.currentRadius);
    pointer.x = nextX;
    pointer.y = nextY;
    pointer.active = true;
    pointer.hasPosition = true;
    pointer.lastTime = eventTime;
  }

  people.forEach((person) => {
    person.addEventListener("click", () => {
      if (person.dataset.url) window.open(person.dataset.url, "_blank", "noopener,noreferrer");
    });
  });

  self.addEventListener("click", switchMobileBatch);

  bubbles.forEach((bubble) => {
    const message = bubble === self ? "Your current location" : bubble.dataset.url ? "Opens an external site" : "Site under construction";
    bubble.addEventListener("mouseenter", (event) => showHint(message, bubble, event));
    bubble.addEventListener("mousemove", (event) => positionHint(event, bubble), { passive: true });
    bubble.addEventListener("mouseleave", hideHint);
    bubble.addEventListener("focus", () => {
      requestAnimationFrame(() => {
        if (bubble.matches(":focus-visible")) showHint(message, bubble);
      });
    });
    bubble.addEventListener("blur", hideHint);
  });

  network.addEventListener("pointermove", updatePointer, { passive: true });
  network.addEventListener("pointerleave", () => {
    pointer.active = false;
    pointer.hasPosition = false;
    pointer.lastTime = 0;
    nodes.forEach((node) => {
      node.nudge.inside = false;
      node.nudge.targetX = 0;
      node.nudge.targetY = 0;
    });
    selfNudge.inside = false;
    selfNudge.targetX = 0;
    selfNudge.targetY = 0;
    targetOrbitSpeedScale = 1;
  });
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(animationFrame);
    if (!document.hidden) {
      lastFrameTime = 0;
      animationFrame = requestAnimationFrame(animate);
    }
  });
  window.addEventListener("resize", layout, { passive: true });
  layout();
  animationFrame = requestAnimationFrame(animate);
})();
