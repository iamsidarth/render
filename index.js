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

function pageShell({ title, body }) {
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
        <p>Enter a URL (e.g. google.com) or a search query.</p>
        
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
        <div class="footer">Streaming & Audio Enabled</div>
      </div>
    </body>
  </html>`;
}

app.get("/", (req, res) => res.send(pageShell({ title: "Secure Portal" })));

app.get("/go", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.redirect("/");

  // IMPROVED DETECTOR: 
  // 1. Starts with http/https
  // 2. Contains a dot followed by common TLDs (com, net, org, etc)
  // 3. Is 'localhost'
  const isUrl = /^(https?:\/\/)|(localhost)|([a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,6}(:[0-9]{1,5})?(\/.*)?)$/i.test(query);

  if (isUrl) {
    const target = query.startsWith("http") ? query : `https://${query}`;
    return res.redirect(`/proxy?url=${encodeURIComponent(target)}`);
  } else {
    return res.redirect(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  }
});

app.use("/proxy", (req, res, next) => {
  const rawTarget = req.query.url;
  if (!rawTarget) return res.status(400).send("No URL provided.");

  try {
    const targetUrl = new URL(rawTarget);
    const proxy = createProxyMiddleware({
      target: targetUrl.origin,
      changeOrigin: true,
      followRedirects: true,
      secure: false, // Set to false to avoid SSL handshake issues on some older sites
      logLevel: "silent",
      pathRewrite: () => `${targetUrl.pathname}${targetUrl.search}`,
      onProxyRes: (proxyRes) => {
        // Strip headers that prevent embedding/streaming
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['x-frame-options'];
        // Ensure audio/video can stream
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      }
    });
    return proxy(req, res, next);
  } catch (e) {
    return res.status(400).send("Invalid URL.");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`Engine Ready on ${port}`));