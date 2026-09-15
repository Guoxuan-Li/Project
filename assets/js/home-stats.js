(function () {
  const widget = document.getElementById("home-stats");
  if (!widget) return;

  const mode = document.body.dataset.backendMode || "demo";
  const API_URL = `${document.body.dataset.apiBase || "/api"}/stats`;
  const VISITED_KEY = "blog-home-visit-counted";
  const DEMO_KEY = "blog-home-demo-stats";
  const REVEAL_TIMEOUT = 2500;
  const BATCH_DELAY = 700;
  const likeButton = document.getElementById("home-like");
  const likeCount = document.getElementById("home-like-count");
  const visitCount = document.getElementById("home-visit-count");

  let likes = 0;
  let pendingLikes = 0;
  let flushTimer = 0;
  let revealed = false;
  const sample = document.getElementById("home-stats-sample");

  function readDemoStats() {
    let stats = {};
    try { stats = JSON.parse(sample?.textContent || "{}"); } catch (_) {}
    try { stats = Object.assign(stats, JSON.parse(localStorage.getItem(DEMO_KEY) || "{}")); } catch (_) {}
    if (visitCount && !localStorage.getItem(VISITED_KEY)) {
      stats.total_visits = (Number(stats.total_visits) || 0) + 1;
      try {
        localStorage.setItem(VISITED_KEY, "true");
        localStorage.setItem(DEMO_KEY, JSON.stringify(stats));
      } catch (_) {}
    }
    return stats;
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    widget.classList.add("is-ready");
    visitCount?.closest(".home-stats__visits")?.classList.add("is-ready");
  }

  function render(stats) {
    likes = Number(stats.homepage_likes) || 0;
    likeCount.textContent = String(likes);
    if (visitCount) visitCount.textContent = String(Number(stats.total_visits) || 0);
    reveal();
  }

  function renderUnavailable() {
    if (!revealed) {
      likeCount.textContent = "?";
      if (visitCount) visitCount.textContent = "?";
    }
    reveal();
  }

  async function request(method, body) {
    const response = await fetch(API_URL, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "站点统计暂时无法载入。");
    return data;
  }

  async function load() {
    if (mode !== "cloudflare") {
      render(readDemoStats());
      return;
    }
    const timeout = window.setTimeout(renderUnavailable, REVEAL_TIMEOUT);

    try {
      let stats;
      if (!visitCount || localStorage.getItem(VISITED_KEY)) {
        stats = await request("GET");
      } else {
        stats = await request("POST", { action: "visit" });
        localStorage.setItem(VISITED_KEY, "true");
      }
      render(stats);
    } catch (error) {
      console.error(error);
      renderUnavailable();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function burstHeart() {
    const particle = likeButton.querySelector(".home-stats__heart").cloneNode(true);
    particle.removeAttribute("aria-hidden");
    particle.setAttribute("aria-hidden", "true");
    particle.classList.add("home-stats__heart-particle");
    particle.style.setProperty("--heart-drift", `${Math.round(Math.random() * 24 - 12)}px`);
    particle.style.setProperty("--heart-turn", `${Math.round(Math.random() * 20 - 10)}deg`);
    widget.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }

  function sendLikes(count, useBeacon = false) {
    if (!count) return;
    if (mode !== "cloudflare") {
      const stats = readDemoStats();
      stats.homepage_likes = likes;
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(stats)); } catch (_) {}
      return;
    }
    for (let remaining = count; remaining > 0; remaining -= 100) {
      const payload = JSON.stringify({ action: "like", count: Math.min(remaining, 100) });

      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(API_URL, new Blob([payload], { type: "application/json" }));
      } else {
        fetch(API_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch((error) => console.error(error));
      }
    }
  }

  function flushLikes(useBeacon = false) {
    window.clearTimeout(flushTimer);
    flushTimer = 0;
    const count = pendingLikes;
    pendingLikes = 0;
    sendLikes(count, useBeacon);
  }

  likeButton.addEventListener("click", function () {
    likes += 1;
    pendingLikes += 1;
    likeCount.textContent = String(likes);
    burstHeart();

    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flushLikes, BATCH_DELAY);
  });

  window.addEventListener("pagehide", () => flushLikes(true));
  load();
})();
