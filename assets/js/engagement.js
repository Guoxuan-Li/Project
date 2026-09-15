(function () {
  "use strict";
  var root = document.querySelector("[data-engagement]");
  if (!root) return;
  var mode = document.body.dataset.backendMode || "demo";
  var api = (document.body.dataset.apiBase || "/api") + "/stats";
  var visits = root.querySelector("[data-visit-count]");
  var likes = root.querySelector("[data-like-count]");
  var button = root.querySelector("[data-site-like]");
  var visitKey = "blog-template-visited";
  var demoKey = "blog-template-stats";
  var sampleElement = document.getElementById("engagement-sample");
  var state = { total_visits: 0, homepage_likes: 0 };
  try { state = Object.assign(state, JSON.parse(sampleElement ? sampleElement.textContent : "{}")); } catch (_) {}

  function render() {
    visits.textContent = state.total_visits;
    likes.textContent = state.homepage_likes;
    root.classList.add("is-ready");
    if (visits) visits.classList.add("is-ready");
  }
  function readDemo() {
    try { state = Object.assign(state, JSON.parse(localStorage.getItem(demoKey) || "{}")); } catch (_) {}
    if (!localStorage.getItem(visitKey)) {
      state.total_visits++;
      localStorage.setItem(visitKey, "1");
      localStorage.setItem(demoKey, JSON.stringify(state));
    }
    render();
  }
  async function request(action) {
    var response = await fetch(api, action ? {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action)
    } : {});
    if (!response.ok) throw new Error("Stats unavailable");
    if (response.status !== 204) state = await response.json();
    render();
  }

  button.addEventListener("click", function () {
    state.homepage_likes++;
    render();
    button.classList.remove("is-popping");
    void button.offsetWidth;
    button.classList.add("is-popping");
    if (!window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (var i = 0; i < 3; i++) {
        var particle = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        particle.setAttribute("viewBox", "0 0 24 24");
        particle.classList.add("home-stats__heart-particle");
        particle.style.setProperty("--heart-drift", ((i - 1) * 1.2) + "rem");
        particle.style.setProperty("--heart-turn", ((i - 1) * 18) + "deg");
        particle.innerHTML = "<path d=\"M20.8 8.7c0 5.3-8.8 10.1-8.8 10.1S3.2 14 3.2 8.7A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.3Z\"/>";
        button.appendChild(particle);
        particle.addEventListener("animationend", function () { this.remove(); });
      }
    }
    if (mode === "cloudflare") request({ action: "like", count: 1 }).catch(function () {});
    else localStorage.setItem(demoKey, JSON.stringify(state));
  });

  if (mode === "cloudflare") {
    var action = localStorage.getItem(visitKey) ? null : { action: "visit" };
    request(action).then(function () { if (action) localStorage.setItem(visitKey, "1"); }).catch(readDemo);
  } else readDemo();
})();
