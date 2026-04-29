const express = require("express");
const fetch = require("node-fetch");

const app = express();
const NO_REWRITE = [
  "reddit.com"
];

function toProxy(url, base) {
  if (!url || url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("blob:") || url.startsWith("#") || url.startsWith("mailto:")) return url;
  try {
    return "/p/" + new URL(url, base).href;
  } catch { return url; }
}

function rewriteCSS(css, base) {
  return css.replace(/url\(['"]?([^'")\s]+)['"]?\)/gi, (m, u) => `url("${toProxy(u, base)}")`);
}

function rewriteHTML(html, base) {

  // =========================
  // 1. FORCE TITLE ON INITIAL LOAD
  // =========================
  html = html.replace(
    /<title[^>]*>[\s\S]*?<\/title>/i,
    "<title>Lens</title>"
  );

  // =========================
  // 2. REWRITE BASIC ATTRIBUTES
  // =========================
  html = html.replace(/(\s)(src|href|action|data-src)\s*=\s*"([^"]*)"/gi,
    (m, s, a, v) => `${s}${a}="${toProxy(v, base)}"`);

  html = html.replace(/(\s)(src|href|action|data-src)\s*=\s*'([^']*)'/gi,
    (m, s, a, v) => `${s}${a}='${toProxy(v, base)}'`);

  html = html.replace(/\ssrcset\s*=\s*"([^"]*)"/gi, (m, val) => {
    const rw = val.replace(/(https?:\/\/\S+)/g, u => toProxy(u, base));
    return ` srcset="${rw}"`;
  });

  html = html.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (m, open, css, close) => open + rewriteCSS(css, base) + close
  );

  // =========================
  // 3. INJECT CLIENT SCRIPT (SPA SAFE)
  // =========================
  const script = `<script>
(function(){

  const BASE = "/p/";
  const target = decodeURIComponent(location.pathname.slice(BASE.length));

  // =========================
  // HISTORY
  // =========================
  try {
    let h = JSON.parse(localStorage.getItem("ph") || "[]");
    h = h.filter(x => x.url !== target);
    h.unshift({ url: target, title: document.title || target, time: Date.now() });
    localStorage.setItem("ph", JSON.stringify(h.slice(0, 100)));
  } catch(e){}

  // =========================
  // FETCH PATCH
  // =========================
  const _fetch = window.fetch;
  window.fetch = function(url, opts) {
    try {
      if (typeof url === "string" &&
          !url.startsWith("/") &&
          !url.startsWith("data:") &&
          !url.startsWith("blob:")) {
        url = BASE + new URL(url, target).href;
      }
    } catch(e){}
    return _fetch(url, opts);
  };

  // =========================
  // XHR PATCH
  // =========================
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, url, ...r) {
    try {
      if (typeof url === "string" &&
          !url.startsWith("/") &&
          !url.startsWith("data:") &&
          !url.startsWith("blob:")) {
        url = BASE + new URL(url, target).href;
      }
    } catch(e){}
    return _open.call(this, m, url, ...r);
  };

  // =========================
  // HISTORY PATCH
  // =========================
  const _push = history.pushState;
  history.pushState = function(s, t, url) {
    try {
      if (url && !url.startsWith(BASE) && !url.startsWith("data:")) {
        url = BASE + new URL(url, target).href;
      }
    } catch(e){}
    return _push.call(this, s, t, url);
  };

  const _replace = history.replaceState;
  history.replaceState = function(s, t, url) {
    try {
      if (url && !url.startsWith(BASE) && !url.startsWith("data:")) {
        url = BASE + new URL(url, target).href;
      }
    } catch(e){}
    return _replace.call(this, s, t, url);
  };

  // =========================
  // TITLE OVERRIDE (SPA SAFE)
  // =========================
  const forceTitle = () => {
    try {
      Object.defineProperty(document, "title", {
        get: () => "Lens",
        set: () => {},
        configurable: true
      });

      document.title = "Lens";
    } catch(e){}

    setInterval(() => {
      if (document.title !== "Lens") {
        document.title = "Lens";
      }
    }, 500);
  };

  forceTitle();

})();
</script>`;

  // =========================
  // 4. INJECT SCRIPT INTO PAGE
  // =========================
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, m => m + script);
  } else {
    html = script + html;
  }

  return html;
}
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Lens</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #080a0f;
      --surface: rgba(255,255,255,0.04);
      --surface-hover: rgba(255,255,255,0.07);
      --border: rgba(255,255,255,0.07);
      --accent: #4f9eff;
      --accent-glow: rgba(79,158,255,0.25);
      --text: #e8eaf0;
      --muted: rgba(255,255,255,0.35);
      --danger: #ff5f5f;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { height: 100%; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Ambient background */
    body::before {
      content: '';
      position: fixed;
      top: -30%;
      left: 50%;
      transform: translateX(-50%);
      width: 800px;
      height: 500px;
      background: radial-gradient(ellipse, rgba(79,158,255,0.07) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    /* Top bar */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 14px 20px;
      background: rgba(8,10,15,0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.3px;
      color: var(--text);
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .logo-dot {
      width: 8px;
      height: 8px;
      background: var(--accent);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--accent);
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 10px var(--accent); }
      50% { opacity: 0.6; box-shadow: 0 0 4px var(--accent); }
    }

    .search-wrap {
      flex: 1;
      position: relative;
      max-width: 680px;
    }
    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      font-size: 14px;
      pointer-events: none;
    }
    .search-wrap input {
      width: 100%;
      padding: 11px 16px 11px 40px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      font-family: 'DM Mono', monospace;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
    }
    .search-wrap input::placeholder { color: var(--muted); font-family: 'DM Sans', sans-serif; }
    .search-wrap input:focus {
      border-color: var(--accent);
      background: rgba(79,158,255,0.05);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .go-btn {
      padding: 11px 22px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s, box-shadow 0.2s;
      box-shadow: 0 0 20px var(--accent-glow);
      white-space: nowrap;
    }
    .go-btn:hover { opacity: 0.88; box-shadow: 0 0 30px var(--accent-glow); }
    .go-btn:active { transform: scale(0.97); }

    /* Main content */
    .main {
      position: relative;
      z-index: 1;
      max-width: 740px;
      margin: 0 auto;
      padding: 40px 20px 60px;
    }

    /* Quick access chips */
    .quick-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 1.2px;
      margin-bottom: 10px;
    }
    .chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 40px;
    }
    .chip {
      padding: 7px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      font-size: 13px;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
    }
    .chip:hover {
      background: var(--surface-hover);
      color: var(--text);
      border-color: rgba(255,255,255,0.15);
    }

    /* Section header */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 500;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 1.2px;
    }
    .clear-btn {
      font-size: 12px;
      color: var(--muted);
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 6px;
      transition: all 0.15s;
      border: 1px solid transparent;
    }
    .clear-btn:hover {
      color: var(--danger);
      border-color: rgba(255,95,95,0.2);
      background: rgba(255,95,95,0.06);
    }

    /* History list */
    .hist-list { display: flex; flex-direction: column; gap: 6px; }

    .hist-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 13px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.15s;
      animation: fadeUp 0.3s ease both;
      text-decoration: none;
      color: inherit;
    }
    .hist-item:hover {
      background: var(--surface-hover);
      border-color: rgba(255,255,255,0.12);
      transform: translateY(-1px);
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .hist-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(79,158,255,0.1);
      border: 1px solid rgba(79,158,255,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }
    .hist-info { flex: 1; min-width: 0; }
    .hist-title {
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .hist-url {
      font-size: 12px;
      font-family: 'DM Mono', monospace;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hist-time {
      font-size: 11px;
      color: var(--muted);
      flex-shrink: 0;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
    }
    .empty-state .icon { font-size: 36px; margin-bottom: 14px; opacity: 0.4; }
    .empty-state p { font-size: 14px; line-height: 1.6; }

    /* Loading bar */
    #loadbar {
      position: fixed;
      top: 0; left: 0;
      height: 2px;
      background: var(--accent);
      box-shadow: 0 0 8px var(--accent);
      width: 0%;
      transition: width 0.3s ease;
      z-index: 9999;
      display: none;
    }
  </style>
</head>
<body>
  <div id="loadbar"></div>

  <div class="topbar">
    <div class="logo">
      <div class="logo-dot"></div>
      Lens
    </div>
    <div class="search-wrap">
      <span class="search-icon">⌕</span>
      <input id="u" type="text" placeholder="Search or enter a URL" onkeydown="if(event.key==='Enter')go()"/>
    </div>
    <button class="go-btn" onclick="go()">Go →</button>
  </div>

  <div class="main">
    <div class="quick-label">Quick Access</div>
    <div class="chips">
      <div class="chip" onclick="nav('https://google.com')">🔍 Google</div>
      <div class="chip" onclick="nav('https://reddit.com')">🟠 Reddit</div>
      <div class="chip" onclick="nav('https://youtube.com')">▶ YouTube</div>
      <div class="chip" onclick="nav('https://github.com')">🐙 GitHub</div>
      <div class="chip" onclick="nav('https://wikipedia.org')">📖 Wikipedia</div>
      <div class="chip" onclick="nav('https://news.ycombinator.com')">🔶 HN</div>
    </div>

    <div class="section-header">
      <span class="section-title">Recent History</span>
      <span class="clear-btn" onclick="clearH()">Clear all</span>
    </div>
    <div class="hist-list" id="hist"></div>
  </div>

  <script>
    function nav(url) {
      startLoad();
      window.location.href = "/p/" + url;
    }
    function go() {
      let v = document.getElementById("u").value.trim();
      if (!v) return;
      if (v.includes(" ") || !v.includes(".")) {
        v = "https://www.google.com/search?q=" + encodeURIComponent(v);
      } else {
        if (!v.startsWith("http")) v = "https://" + v;
      }
      startLoad();
      window.location.href = "/p/" + v;
    }
    function startLoad() {
      const bar = document.getElementById("loadbar");
      bar.style.display = "block";
      bar.style.width = "70%";
    }
    function relTime(ts) {
      const d = Date.now() - ts;
      if (d < 60000) return "just now";
      if (d < 3600000) return Math.floor(d/60000) + "m ago";
      if (d < 86400000) return Math.floor(d/3600000) + "h ago";
      return Math.floor(d/86400000) + "d ago";
    }
    function getDomain(url) {
      try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
    }
    function getEmoji(url) {
      const d = getDomain(url);
      if (d.includes("google")) return "🔍";
      if (d.includes("reddit")) return "🟠";
      if (d.includes("youtube")) return "▶";
      if (d.includes("github")) return "🐙";
      if (d.includes("wiki")) return "📖";
      if (d.includes("twitter") || d.includes("x.com")) return "✖";
      if (d.includes("news.ycombinator")) return "🔶";
      return "🌐";
    }
    function loadH() {
      try {
        const h = JSON.parse(localStorage.getItem("ph") || "[]");
        const el = document.getElementById("hist");
        if (!h.length) {
          el.innerHTML = \`<div class="empty-state"><div class="icon">🌐</div><p>No history yet.<br>Enter a URL or pick a quick access site above.</p></div>\`;
          return;
        }
        el.innerHTML = h.map((x, i) => \`
          <div class="hist-item" style="animation-delay:\${i * 40}ms" onclick="nav(\${JSON.stringify(x.url)})">
            <div class="hist-icon">\${getEmoji(x.url)}</div>
            <div class="hist-info">
              <div class="hist-title">\${x.title || getDomain(x.url)}</div>
              <div class="hist-url">\${getDomain(x.url)}</div>
            </div>
            <div class="hist-time">\${relTime(x.time)}</div>
          </div>
        \`).join("");
      } catch(e) {}
    }
    function clearH() {
      localStorage.removeItem("ph");
      loadH();
    }
    loadH();
  </script>
</body>
</html>`);
});

app.use("/p/", async (req, res) => {
  let target;

  try {
    target = decodeURIComponent(req.originalUrl.slice(3));
  } catch {
    return res.status(400).send("Invalid URL");
  }

  if (!target.startsWith("http")) {
    return res.redirect("/");
  }

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      },
      redirect: "manual"
    });

    const ct = response.headers.get("content-type") || "";

    // =========================
    // 1. REDDIT / NO-REWRITE MODE
    // =========================
    if (NO_REWRITE.some(d => target.includes(d))) {
      const location = response.headers.get("location");

      if (location) {
        return res.redirect(toProxy(location, target));
      }

      res.status(response.status);
      res.setHeader("content-type", ct);
      return response.body.pipe(res);
    }

    // =========================
    // 2. HTML REWRITE
    // =========================
    if (ct.includes("text/html")) {
      const html = await response.text();
      return res.send(rewriteHTML(html, target));
    }

    // =========================
    // 3. CSS REWRITE
    // =========================
    if (ct.includes("text/css")) {
      const css = await response.text();
      return res.send(rewriteCSS(css, target));
    }

    // =========================
    // 4. EVERYTHING ELSE
    // =========================
    res.status(response.status);
    res.setHeader("content-type", ct);
    return response.body.pipe(res);

  } catch (e) {
    console.error("Proxy error:", e);

    res.status(500).send(`<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
</head>
<body style="font-family:'DM Sans',sans-serif;background:#080a0f;color:#e8eaf0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="text-align:center;padding:40px">
    <div style="font-size:48px;margin-bottom:20px">⚠️</div>
    <h2 style="font-size:20px;margin-bottom:8px">Failed to load</h2>
    <p style="color:rgba(255,255,255,0.35);font-size:14px;margin-bottom:24px">${e.message}</p>
    <a href="/" style="color:#4f9eff;text-decoration:none;font-size:14px;padding:10px 20px;border:1px solid rgba(79,158,255,0.3);border-radius:10px">
      ← Back to Lens
    </a>
  </div>
</body>
</html>`);
  }
});

app.listen(process.env.PORT || 3000);