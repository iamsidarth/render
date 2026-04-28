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
          overflow: hidden;
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
          width: min(700px, 90%);
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
        p {
          color: var(--muted);
          font-size: 17px;
          line-height: 1.6;
          margin-bottom: 40px;
        }
        .omnibox {
          display: flex;
          gap: 12px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px;
          border-radius: 20px;
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .omnibox:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(110, 168, 255, 0.15);
        }
        input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          padding: 12px 16px;
          font-size: 16px;
          outline: none;
        }
        input::placeholder { color: #5a6b8a; }
        .btn-go {
          background: linear-gradient(135deg, #6ea8ff, #9d7bff);
          color: #08111f;
          border: none;
          padding: 0 28px;
          border-radius: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .btn-go:hover { transform: scale(1.02); }
        .footer {
          margin-top: 32px;
          font-size: 13px;
          color: #5a6b8a;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="eyebrow">Secure Gateway</div>
        <h1>Search or Proxy</h1>
        <p>Type a URL to browse privately, or enter a query to search the web instantly.</p>
        
        <form action="/go" method="get" class="omnibox">
          <input 
            type="text" 
            name="q" 
            placeholder="Search Google or enter https://..." 
            autocomplete="off" 
            autofocus 
            required 
          />
          <button type="submit" class="btn-go">Go</button>
        </form>

        <div class="footer">
          Ready for Render • Powered by Node.js
        </div>
      </div>
    </body>
  </html>`;
}

app.get("/", (req, res) => res.send(pageShell({ title: "Portal" })));

app.get("/go", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.redirect("/");

  // Determine if input is a URL or a Search
  const isUrl = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?(\?.*)?$/.test(query);

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
      secure: targetUrl.protocol === "https:",
      logLevel: "silent",
      pathRewrite: () => `${targetUrl.pathname}${targetUrl.search}`,
      onProxyRes: (proxyRes) => {
        // Essential for streaming media/audio correctly
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['x-frame-options'];
      }
    });
    return proxy(req, res, next);
  } catch (e) {
    return res.status(400).send("Invalid URL.");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`Active on ${port}`));