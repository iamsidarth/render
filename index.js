const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
app.disable("x-powered-by");

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pageShell({ title }) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #08111f;
          --bg2: #0c1730;
          --panel: rgba(9, 16, 31, 0.74);
          --panel-border: rgba(159, 179, 255, 0.18);
          --text: #edf3ff;
          --muted: #9fb0d0;
          --accent: #6ea8ff;
          --shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: var(--text);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at top left, rgba(110, 168, 255, 0.2), transparent 40%),
            radial-gradient(circle at bottom right, rgba(157, 123, 255, 0.15), transparent 40%),
            linear-gradient(160deg, var(--bg), var(--bg2));
        }
        body::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 45px 45px;
          mask-image: radial-gradient(circle at center, black 30%, transparent 100%);
          opacity: 0.4;
        }
        .container {
          position: relative;
          width: min(700px, 95%);
          padding: 60px 40px;
          background: var(--panel);
          border: 1px solid var(--panel-border);
          border-radius: 32px;
          backdrop-filter: blur(24px);
          box-shadow: var(--shadow);
          text-align: center;
          z-index: 10;
        }
        .eyebrow {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 99px;
          background: rgba(110, 168, 255, 0.1);
          color: var(--accent);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 20px;
        }
        h1 {
          font-size: clamp(32px, 5vw, 48px);
          margin: 0 0 16px;
          letter-spacing: -0.04em;
          background: linear-gradient(135deg, #fff 0%, #a8c8ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        p { color: var(--muted); font-size: 17px; margin-bottom: 40px; }
        .chips {
          display: flex; gap: 8px; justify-content: center;
          flex-wrap: wrap; margin-bottom: 28px;
        }
        .chip {
          padding: 5px 14px; border-radius: 99px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--muted); font-size: 13px;
          cursor: pointer; text-decoration: none;
          transition: background .2s;
        }
        .chip:hover { background: rgba(110,168,255,0.15); color: var(--accent); }
        .omnibox {
          display: flex;
          gap: 12px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 10px;
          border-radius: 20px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .omnibox:focus-within {
          border-color: var(--accent);
          background: rgba(0, 0, 0, 0.4);
          box-shadow: 0 0 0 4px rgba(110, 168, 255, 0.15);
        }
        input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          padding: 12px 16px;
          font-size: 18px;
          outline: none;
        }
        .btn-go {
          background: linear-gradient(135deg, #6ea8ff, #9d7bff);
          color: #08111f;
          border: none;
          padding: 0 32px;
          border-radius: 14px;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .btn-go:hover { transform: scale(1.05); }
        .footer { margin-top: 32px; font-size: 13px; color: #5a6b8a; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="eyebrow">Cloud Proxy v2.0</div>
        <h1>Portal</h1>
        <div class="chips">
          <a class="chip" href="/go?q=old.reddit.com">Reddit</a>
          <a class="chip" href="/go?q=en.wikipedia.org">Wikipedia</a>
          <a class="chip" href="/go?q=news.ycombinator.com">Hacker News</a>
          <a class="chip" href="/go?q=lite.cnn.com">CNN Lite</a>
        </div>
        <p>Enter a URL (e.g. reddit.com) or a search query.</p>
        <form action="/go" method="get" class="omnibox">
          <input
            type="text"
            name="q"
            placeholder="Type here..."
            autocomplete="off"
            autofocus
            required
          />
          <button type="submit" class="btn-go">Go</button>
        </form>
        <div class="footer">Streaming &amp; Audio Enabled</div>
      </div>
    </body>
  </html>`;
}

app.get("/", (req, res) => res.send(pageShell({ title: "Secure Portal" })));

app.get("/go", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.redirect("/");

  const isUrl = /^(https?:\/\/)|(localhost)|([a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,6}(:[0-9]{1,5})?(\/.*)?)$/i.test(query);

  if (isUrl) {
    const target = query.startsWith("http") ? query : `https://${query}`;
    return res.redirect(`/proxy?url=${encodeURIComponent(target)}`);
  } else {
    // Use DuckDuckGo Lite — works through proxy, no JS required
    const ddg = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    return res.redirect(`/proxy?url=${encodeURIComponent(ddg)}`);
  }
});

// Inject a small script into HTML pages so that link clicks and form
// submissions stay inside the proxy instead of escaping to the real origin.
function makeInjectedScript(proxyBase, pageOrigin) {
  return `<script>
(function(){
  var BASE="${proxyBase}", ORIGIN="${pageOrigin}";
  function wrap(u){
    if(!u||/^(#|javascript:|blob:|data:)/i.test(u))return u;
    try{ return BASE+"/proxy?url="+encodeURIComponent(new URL(u,ORIGIN).href); }
    catch(e){ return u; }
  }
  // Intercept all clicks on <a> tags
  document.addEventListener("click",function(e){
    var a=e.target.closest("a[href]");
    if(!a)return;
    var h=a.getAttribute("href");
    if(!h||/^(#|javascript:)/i.test(h))return;
    e.preventDefault();
    location.href=wrap(h);
  },true);
  // Intercept form submissions
  document.addEventListener("submit",function(e){
    var f=e.target, action=f.getAttribute("action")||"";
    if(action&&!/^(#|javascript:)/i.test(action)) f.action=wrap(action);
  },true);
})();
</script>`;
}

app.use("/proxy", (req, res, next) => {
  const rawTarget = req.query.url;
  if (!rawTarget) return res.status(400).send("No URL provided.");

  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
  } catch (e) {
    return res.status(400).send("Invalid URL.");
  }

  // For reddit.com page requests, rewrite to old.reddit.com
  // Leave CDN hosts (redditstatic.com, redd.it, redditmedia.com) untouched
  const host = targetUrl.hostname;
  const isRedditPage =
    host === "reddit.com" ||
    host === "www.reddit.com" ||
    host === "old.reddit.com" ||
    host === "oauth.reddit.com";

  if (isRedditPage) {
    targetUrl.hostname = "old.reddit.com";
  }

  const proxyBase = `${req.protocol}://${req.get("host")}`;
  const pageOrigin = targetUrl.origin;

  const proxy = createProxyMiddleware({
    target: targetUrl.origin,
    changeOrigin: true,
    followRedirects: false, // we handle redirects ourselves below
    secure: false,
    logLevel: "silent",
    pathRewrite: () => `${targetUrl.pathname}${targetUrl.search}`,

    on: {
      proxyReq: (proxyReq) => {
        // Spoof headers so sites don't block us as a bot
        proxyReq.setHeader("host", targetUrl.hostname);
        proxyReq.setHeader("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        proxyReq.setHeader("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
        proxyReq.setHeader("accept-language", "en-US,en;q=0.9");
        proxyReq.setHeader("sec-fetch-dest", "document");
        proxyReq.setHeader("sec-fetch-mode", "navigate");
        proxyReq.setHeader("sec-fetch-site", "none");
        proxyReq.removeHeader("x-forwarded-for");
        proxyReq.removeHeader("x-forwarded-host");
        proxyReq.removeHeader("x-forwarded-proto");
      },

      proxyRes: (proxyRes, req2, res2) => {
        // Strip headers that break embedding
        delete proxyRes.headers["content-security-policy"];
        delete proxyRes.headers["content-security-policy-report-only"];
        delete proxyRes.headers["x-frame-options"];
        delete proxyRes.headers["strict-transport-security"];

        // Allow cross-origin media
        proxyRes.headers["access-control-allow-origin"] = "*";

        // Fix cookies — remove Secure/SameSite so they survive HTTP proxy
        if (proxyRes.headers["set-cookie"]) {
          proxyRes.headers["set-cookie"] = proxyRes.headers["set-cookie"].map(c =>
            c.replace(/;\s*secure/gi, "").replace(/;\s*samesite=[^;]*/gi, "")
          );
        }

        // Rewrite redirect Location to stay inside proxy
        const loc = proxyRes.headers["location"];
        if (loc) {
          let abs = loc;
          if (abs.startsWith("//")) abs = `${targetUrl.protocol}${abs}`;
          else if (abs.startsWith("/")) abs = `${pageOrigin}${abs}`;
          else if (!/^https?:\/\//i.test(abs)) abs = `${pageOrigin}/${abs}`;
          proxyRes.headers["location"] = `${proxyBase}/proxy?url=${encodeURIComponent(abs)}`;
        }

        const ct = (proxyRes.headers["content-type"] || "").toLowerCase();
        const isHtml = ct.includes("text/html");

        if (!isHtml) return; // let http-proxy-middleware stream binary as-is

        // For HTML we need to buffer, rewrite src/href/action, inject script
        const zlib = require("zlib");
        const enc = proxyRes.headers["content-encoding"];

        delete proxyRes.headers["content-encoding"];
        delete proxyRes.headers["content-length"];

        let stream = proxyRes;
        if (enc === "gzip")    stream = proxyRes.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = proxyRes.pipe(zlib.createInflate());
        else if (enc === "br") stream = proxyRes.pipe(zlib.createBrotliDecompress());

        const chunks = [];
        stream.on("data", c => chunks.push(c));
        stream.on("end", () => {
          let html = Buffer.concat(chunks).toString("utf8");

          // Rewrite absolute src/href/action pointing anywhere → proxy
          html = html.replace(
            /((?:src|href|action|data-src)\s*=\s*)(["'])(https?:\/\/[^"']+)\2/gi,
            (_, attr, q, url) => `${attr}${q}${proxyBase}/proxy?url=${encodeURIComponent(url)}${q}`
          );

          // Rewrite protocol-relative //domain.com/path → proxy
          html = html.replace(
            /((?:src|href|action)\s*=\s*["'])(\/\/[a-z0-9][^"']+)(["'])/gi,
            (_, pre, url, post) => `${pre}${proxyBase}/proxy?url=${encodeURIComponent("https:" + url)}${post}`
          );

          // Rewrite root-relative /path → proxy (using current page origin)
          html = html.replace(
            /((?:src|href|action)\s*=\s*["'])(\/(?!\/)[^"']*)(["'])/gi,
            (_, pre, path, post) => `${pre}${proxyBase}/proxy?url=${encodeURIComponent(pageOrigin + path)}${post}`
          );

          // Inject navigation intercept script
          const script = makeInjectedScript(proxyBase, pageOrigin);
          if (html.includes("</body>")) {
            html = html.replace("</body>", script + "</body>");
          } else {
            html += script;
          }

          res2.writeHead(proxyRes.statusCode, proxyRes.headers);
          res2.end(html, "utf8");
        });

        stream.on("error", err => {
          if (!res2.headersSent) res2.status(502).send("Stream error: " + err.message);
        });
      },

      error: (err, req2, res2) => {
        console.error("Proxy error:", err.message);
        if (!res2.headersSent) res2.status(502).send(`Could not reach target: ${err.message}`);
      },
    },
  });

  return proxy(req, res, next);
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`Engine Ready on ${port}`));