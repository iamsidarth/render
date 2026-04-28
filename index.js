const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const https = require("https");
const http = require("http");
const zlib = require("zlib");

const app = express();
app.disable("x-powered-by");

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Rewrite URLs in HTML/CSS/JS so relative & absolute paths
 * route through the proxy instead of hitting the origin directly.
 */
function rewriteUrls(content, targetOrigin, proxyBase) {
  // Rewrite absolute URLs pointing to target origin
  content = content.replace(
    new RegExp(`(https?:)?//${escapeRegex(targetOrigin.replace(/^https?:\/\//, ""))}`, "gi"),
    proxyBase
  );

  // Rewrite protocol-relative //other.domain.com URLs → wrap in proxy
  content = content.replace(
    /(['"\s(=])(\/\/[a-z0-9][-a-z0-9.]*\.[a-z]{2,}[^'"\s)]*)/gi,
    (_, pre, url) => `${pre}${proxyBase}?url=${encodeURIComponent("https:" + url)}`
  );

  // Rewrite href="/path" and src="/path" and action="/path" to go via proxy
  content = content.replace(
    /(href|src|action|data-src|data-href)=(["'])\/([^/][^"']*)(["'])/gi,
    (_, attr, q1, path, q2) =>
      `${attr}=${q1}/proxy?url=${encodeURIComponent(targetOrigin + "/" + path)}${q2}`
  );

  return content;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pageShell({ title, body = "" }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08111f; --bg2: #0c1730;
        --panel: rgba(9,16,31,0.74);
        --panel-border: rgba(159,179,255,0.18);
        --text: #edf3ff; --muted: #9fb0d0;
        --accent: #6ea8ff;
        --shadow: 0 24px 80px rgba(0,0,0,0.35);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        color: var(--text); min-height: 100vh;
        display: flex; align-items: center; justify-content: center;
        background:
          radial-gradient(circle at top left, rgba(110,168,255,0.2), transparent 40%),
          radial-gradient(circle at bottom right, rgba(157,123,255,0.15), transparent 40%),
          linear-gradient(160deg, var(--bg), var(--bg2));
      }
      body::before {
        content: ""; position: fixed; inset: 0; pointer-events: none;
        background-image:
          linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
        background-size: 45px 45px;
        mask-image: radial-gradient(circle at center, black 30%, transparent 100%);
        opacity: 0.4;
      }
      .container {
        position: relative; width: min(700px, 95%); padding: 60px 40px;
        background: var(--panel); border: 1px solid var(--panel-border);
        border-radius: 32px; backdrop-filter: blur(24px);
        box-shadow: var(--shadow); text-align: center; z-index: 10;
      }
      .eyebrow {
        display: inline-block; padding: 6px 14px; border-radius: 99px;
        background: rgba(110,168,255,0.1); color: var(--accent);
        font-size: 12px; font-weight: 600; letter-spacing: 0.05em;
        text-transform: uppercase; margin-bottom: 20px;
      }
      h1 {
        font-size: clamp(32px,5vw,48px); margin: 0 0 16px;
        letter-spacing: -0.04em;
        background: linear-gradient(135deg, #fff 0%, #a8c8ff 100%);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      }
      p { color: var(--muted); font-size: 17px; margin-bottom: 40px; }
      .omnibox {
        display: flex; gap: 12px;
        background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
        padding: 10px; border-radius: 20px;
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
      }
      .omnibox:focus-within {
        border-color: var(--accent); background: rgba(0,0,0,0.4);
        box-shadow: 0 0 0 4px rgba(110,168,255,0.15);
      }
      input {
        flex: 1; background: transparent; border: none;
        color: white; padding: 12px 16px; font-size: 18px; outline: none;
      }
      .btn-go {
        background: linear-gradient(135deg, #6ea8ff, #9d7bff);
        color: #08111f; border: none; padding: 0 32px;
        border-radius: 14px; font-weight: 700; font-size: 16px;
        cursor: pointer; transition: transform 0.2s;
      }
      .btn-go:hover { transform: scale(1.05); }
      .footer { margin-top: 32px; font-size: 13px; color: #5a6b8a; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="eyebrow">Cloud Proxy v3.0</div>
      <h1>Portal</h1>
      <p>Enter a URL (e.g. reddit.com) or a search query.</p>
      <form action="/go" method="get" class="omnibox">
        <input type="text" name="q" placeholder="Type here..." autocomplete="off" autofocus required />
        <button type="submit" class="btn-go">Go</button>
      </form>
      <div class="footer">Audio · Video · Images · Reddit Enabled</div>
    </div>
  </body>
</html>`;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => res.send(pageShell({ title: "Secure Portal" })));

app.get("/go", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.redirect("/");

  const isUrl =
    /^https?:\/\//i.test(query) ||
    query === "localhost" ||
    /^([a-z0-9]+([\-.][a-z0-9]+)*\.[a-z]{2,6})(:[0-9]{1,5})?(\/.*)?$/i.test(query);

  if (isUrl) {
    const target = /^https?:\/\//i.test(query) ? query : `https://${query}`;
    return res.redirect(`/proxy?url=${encodeURIComponent(target)}`);
  }

  // Route searches through proxy so they stay inside the portal
  const googleSearch = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return res.redirect(`/proxy?url=${encodeURIComponent(googleSearch)}`);
});

// ─── Proxy ──────────────────────────────────────────────────────────────────

app.use("/proxy", (req, res) => {
  const rawTarget = req.query.url;
  if (!rawTarget) return res.status(400).send("No URL provided.");

  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
  } catch {
    return res.status(400).send("Invalid URL.");
  }

  const isReddit =
    targetUrl.hostname === "www.reddit.com" ||
    targetUrl.hostname === "reddit.com" ||
    targetUrl.hostname.endsWith(".reddit.com");

  // For Reddit use old.reddit.com — much simpler HTML, no JS required
  if (isReddit) {
    targetUrl.hostname = "old.reddit.com";
  }

  const requestHeaders = {
    host: targetUrl.hostname,
    // Mimic a real browser so sites don't block us
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "upgrade-insecure-requests": "1",
    "sec-fetch-dest": req.headers["sec-fetch-dest"] || "document",
    "sec-fetch-mode": req.headers["sec-fetch-mode"] || "navigate",
    "sec-fetch-site": "none",
    // Pass cookies through (needed for logged-in sites)
    ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
  };

  // Forward any range header (needed for audio/video seeking)
  if (req.headers.range) requestHeaders.range = req.headers.range;

  const options = {
    hostname: targetUrl.hostname,
    path: `${targetUrl.pathname}${targetUrl.search}`,
    method: req.method,
    headers: requestHeaders,
    rejectUnauthorized: false, // allow self-signed certs
  };

  const proto = targetUrl.protocol === "https:" ? https : http;

  const proxyReq = proto.request(options, (proxyRes) => {
    // Strip restrictive headers
    const headers = { ...proxyRes.headers };
    delete headers["content-security-policy"];
    delete headers["content-security-policy-report-only"];
    delete headers["x-frame-options"];
    delete headers["strict-transport-security"];
    headers["access-control-allow-origin"] = "*";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-allow-headers"] = "*";

    // Pass Set-Cookie back to the browser (keeps sessions alive)
    if (proxyRes.headers["set-cookie"]) {
      headers["set-cookie"] = proxyRes.headers["set-cookie"].map((c) =>
        c.replace(/;\s*secure/gi, "").replace(/;\s*samesite=[^;]*/gi, "")
      );
    }

    const contentType = (headers["content-type"] || "").split(";")[0].toLowerCase();
    const isHtml = contentType === "text/html";
    const isCss = contentType === "text/css";
    const isJs =
      contentType === "application/javascript" ||
      contentType === "text/javascript";

    // Handle redirects — rewrite Location header
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
      const loc = proxyRes.headers.location;
      if (loc) {
        let absolute = loc;
        if (loc.startsWith("//")) absolute = `${targetUrl.protocol}${loc}`;
        else if (loc.startsWith("/")) absolute = `${targetUrl.origin}${loc}`;
        else if (!loc.startsWith("http")) absolute = `${targetUrl.origin}/${loc}`;
        headers.location = `/proxy?url=${encodeURIComponent(absolute)}`;
      }
      res.writeHead(proxyRes.statusCode, headers);
      res.end();
      return;
    }

    // For binary content (images, audio, video) stream straight through
    if (!isHtml && !isCss && !isJs) {
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
      return;
    }

    // For text content: decompress → rewrite URLs → send
    delete headers["content-encoding"]; // we'll decompress
    delete headers["content-length"];   // length will change

    const encoding = proxyRes.headers["content-encoding"];
    let stream = proxyRes;
    if (encoding === "gzip") stream = proxyRes.pipe(zlib.createGunzip());
    else if (encoding === "deflate") stream = proxyRes.pipe(zlib.createInflate());
    else if (encoding === "br") stream = proxyRes.pipe(zlib.createBrotliDecompress());

    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      let body = Buffer.concat(chunks).toString("utf8");
      const proxyBase = `${req.protocol}://${req.get("host")}`;

      if (isHtml) {
        body = rewriteUrls(body, targetUrl.origin, proxyBase);

        // Inject a base-tag + our intercept script right after <head>
        const interceptScript = `
<script>
(function() {
  var base = "${proxyBase}";
  var origin = "${targetUrl.origin}";
  // Intercept link clicks
  document.addEventListener("click", function(e) {
    var a = e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript")) return;
    var abs;
    try {
      abs = new URL(href, origin).href;
    } catch(err) { return; }
    e.preventDefault();
    window.location.href = base + "/proxy?url=" + encodeURIComponent(abs);
  });
  // Intercept form submissions
  document.addEventListener("submit", function(e) {
    var form = e.target;
    var action = form.action || origin;
    var abs;
    try { abs = new URL(action, origin).href; } catch(err) { return; }
    // Let the form data go through the proxy
    form.action = base + "/proxy?url=" + encodeURIComponent(abs);
  });
})();
</script>`;

        // Inject before </body> if present, otherwise append
        if (body.includes("</body>")) {
          body = body.replace("</body>", interceptScript + "</body>");
        } else {
          body += interceptScript;
        }
      } else if (isCss) {
        // Rewrite url() in CSS
        body = body.replace(
          /url\(\s*(['"]?)(?!data:)([^'")\s]+)\1\s*\)/gi,
          (_, q, url) => {
            let abs = url;
            if (url.startsWith("//")) abs = `https:${url}`;
            else if (url.startsWith("/")) abs = `${targetUrl.origin}${url}`;
            else if (!url.startsWith("http")) abs = `${targetUrl.origin}/${url}`;
            return `url(${q}/proxy?url=${encodeURIComponent(abs)}${q})`;
          }
        );
      }

      res.writeHead(proxyRes.statusCode, headers);
      res.end(body, "utf8");
    });

    stream.on("error", (err) => {
      console.error("Stream error:", err.message);
      if (!res.headersSent) res.status(502).send("Stream error.");
    });
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    if (!res.headersSent) res.status(502).send(`Could not reach ${targetUrl.hostname}.`);
  });

  // Pipe the request body through (for POST forms etc.)
  req.pipe(proxyReq);
});

// ─── Start ───────────────────────────────────────────────────────────────────

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`Proxy ready on port ${port}`));