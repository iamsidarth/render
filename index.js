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
    .replace(/'/g, "&#39;");
}

function pageShell({ title, description, body }) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <meta name="description" content="${escapeHtml(description)}" />
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
          --accent-2: #9d7bff;
          --shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
          --radius: 24px;
          --radius-sm: 16px;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: var(--text);
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(110, 168, 255, 0.25), transparent 34%),
            radial-gradient(circle at top right, rgba(157, 123, 255, 0.18), transparent 28%),
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
          background-size: 42px 42px;
          mask-image: radial-gradient(circle at center, black 48%, transparent 100%);
          opacity: 0.45;
        }
        .wrap {
          width: min(1120px, calc(100% - 32px));
          margin: 0 auto;
          padding: 34px 0 56px;
        }
        .hero {
          display: grid;
          gap: 22px;
          padding: 34px;
          border: 1px solid var(--panel-border);
          border-radius: calc(var(--radius) + 4px);
          background: linear-gradient(180deg, rgba(14, 24, 44, 0.88), rgba(8, 14, 28, 0.76));
          backdrop-filter: blur(16px);
          box-shadow: var(--shadow);
          overflow: hidden;
          position: relative;
        }
        .hero::after {
          content: "";
          position: absolute;
          inset: auto -10% -55% auto;
          width: 420px;
          height: 420px;
          background: radial-gradient(circle, rgba(110, 168, 255, 0.2), transparent 68%);
          pointer-events: none;
        }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--muted);
          background: rgba(255,255,255,0.04);
          font-size: 13px;
          letter-spacing: 0.02em;
        }
        h1 {
          margin: 0;
          font-size: clamp(38px, 6vw, 66px);
          line-height: 0.95;
          letter-spacing: -0.05em;
          max-width: 12ch;
        }
        .lede {
          margin: 0;
          max-width: 66ch;
          color: var(--muted);
          font-size: 16px;
          line-height: 1.7;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-top: 10px;
        }
        .card {
          border: 1px solid var(--panel-border);
          border-radius: var(--radius);
          background: var(--panel);
          box-shadow: var(--shadow);
          backdrop-filter: blur(14px);
          padding: 20px;
        }
        .card h2 {
          margin: 0 0 8px;
          font-size: 20px;
          letter-spacing: -0.03em;
        }
        .card p {
          margin: 0 0 16px;
          color: var(--muted);
          line-height: 1.6;
        }
        form {
          display: grid;
          gap: 12px;
        }
        .field {
          display: grid;
          gap: 8px;
        }
        label {
          font-size: 13px;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: #bfd0f6;
        }
        input {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 16px;
          padding: 15px 16px;
          background: rgba(255,255,255,0.05);
          color: var(--text);
          outline: none;
          font-size: 15px;
        }
        input::placeholder { color: #7f8ea9; }
        input:focus {
          border-color: rgba(110,168,255,0.75);
          box-shadow: 0 0 0 4px rgba(110,168,255,0.14);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .btn, .link-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 14px;
          padding: 12px 14px;
          text-decoration: none;
          font-weight: 600;
          border: 1px solid transparent;
          transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
        }
        .btn:hover, .link-chip:hover { transform: translateY(-1px); }
        .btn-primary {
          color: #04101f;
          background: linear-gradient(135deg, #a8c8ff, #7ca7ff 60%, #b29cff);
        }
        .btn-secondary {
          color: var(--text);
          border-color: rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 10px;
        }
        .link-chip {
          color: var(--text);
          border-color: rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          font-size: 14px;
        }
        .results {
          display: grid;
          gap: 12px;
        }
        .result {
          display: grid;
          gap: 8px;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.04);
        }
        .result a {
          color: #d7e5ff;
          text-decoration: none;
          font-weight: 700;
          font-size: 15px;
        }
        .result a:hover { color: #ffffff; }
        .result .url {
          font-size: 13px;
          color: #88a0c9;
          word-break: break-all;
        }
        .result .desc {
          margin: 0;
          color: var(--muted);
          line-height: 1.55;
        }
        .footer {
          margin-top: 18px;
          color: #88a0c9;
          font-size: 13px;
        }
        @media (max-width: 860px) {
          .grid { grid-template-columns: 1fr; }
          .hero { padding: 24px; }
          h1 { max-width: none; }
        }
      </style>
    </head>
    <body>
      <main class="wrap">
        ${body}
      </main>
    </body>
  </html>`;
}

function renderHome({ proxyUrl = "", searchQuery = "" } = {}) {
  return pageShell({
    title: "Proxy Search",
    description: "Open a site through the proxy or jump straight to Google search links.",
    body: `
      <section class="hero">
        <div class="eyebrow">Proxy server · search gateway · Render ready</div>
        <h1>Browse fast. Search clean. Proxy what you need.</h1>
        <p class="lede">
          Paste a URL to proxy a site, or type a query to generate useful Google search links.
          Built for quick access, not clutter.
        </p>
        <div class="grid">
          <div class="card">
            <h2>Open a URL</h2>
            <p>Send any http or https page through the proxy.</p>
            <form action="/proxy" method="get">
              <div class="field">
                <label for="url">Website URL</label>
                <input id="url" name="url" value="${escapeHtml(proxyUrl)}" placeholder="https://example.com" />
              </div>
              <div class="actions">
                <button class="btn btn-primary" type="submit">Open proxy</button>
                <a class="btn btn-secondary" href="/healthz">Health check</a>
              </div>
            </form>
          </div>
          <div class="card">
            <h2>Search Google</h2>
            <p>Generate direct search links for the query you type.</p>
            <form action="/search" method="get">
              <div class="field">
                <label for="q">Search query</label>
                <input id="q" name="q" value="${escapeHtml(searchQuery)}" placeholder="best proxy server" />
              </div>
              <div class="actions">
                <button class="btn btn-primary" type="submit">Generate links</button>
                <a class="btn btn-secondary" href="https://www.google.com" target="_blank" rel="noreferrer">Google</a>
              </div>
            </form>
          </div>
        </div>
      </section>
    `,
  });
}

function renderSearchLinks(query) {
  const q = String(query || "").trim();
  const encoded = encodeURIComponent(q);
  const links = [
    {
      label: "Google Search",
      url: `https://www.google.com/search?q=${encoded}`,
      desc: "Standard web results on Google.",
    },
    {
      label: "Google Images",
      url: `https://www.google.com/search?tbm=isch&q=${encoded}`,
      desc: "Image results for the same query.",
    },
    {
      label: "Google News",
      url: `https://www.google.com/search?tbm=nws&q=${encoded}`,
      desc: "News coverage matching your search.",
    },
    {
      label: "Google Videos",
      url: `https://www.google.com/search?tbm=vid&q=${encoded}`,
      desc: "Video results from around the web.",
    },
    {
      label: "Google Maps",
      url: `https://www.google.com/maps/search/${encoded}`,
      desc: "Places and location results.",
    },
  ];

  return pageShell({
    title: q ? `${q} on Google` : "Google Search Links",
    description: "Direct Google search links generated from your query.",
    body: `
      <section class="hero">
        <div class="eyebrow">Google search links</div>
        <h1>${q ? escapeHtml(q) : "Type a query to get search links"}</h1>
        <p class="lede">
          ${q ? "Choose a Google view below or run another search from the homepage." : "No query was provided. Use the search form on the homepage."}
        </p>
        <div class="actions">
          <a class="btn btn-primary" href="/">Back home</a>
          ${q ? `<a class="btn btn-secondary" href="https://www.google.com/search?q=${encoded}" target="_blank" rel="noreferrer">Open Google results</a>` : ""}
        </div>
      </section>
      <section style="margin-top:18px" class="card">
        <h2>Search shortcuts</h2>
        <p>Click a link to jump straight into the Google surface you want.</p>
        <div class="results">
          ${links
            .map(
              (link) => `
                <div class="result">
                  <a href="${link.url}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>
                  <div class="url">${escapeHtml(link.url)}</div>
                  <p class="desc">${escapeHtml(link.desc)}</p>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="footer">Tip: use the proxy form if you want to open a direct site URL instead of a search.</div>
      </section>
    `,
  });
}

app.get("/", (req, res) => {
  const target = req.query.url || "";
  const search = req.query.q || "";

  if (target) {
    return res.redirect(`/proxy?url=${encodeURIComponent(target)}`);
  }

  if (search) {
    return res.redirect(`/search?q=${encodeURIComponent(search)}`);
  }

  return res.send(renderHome());
});

app.get("/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  return res.send(renderSearchLinks(q));
});

app.use("/proxy", (req, res, next) => {
  const rawTarget = req.query.url;

  if (!rawTarget) {
    return res.status(400).send("Missing url query parameter.");
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
  } catch {
    return res.status(400).send("Invalid URL.");
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return res.status(400).send("Only http and https URLs are allowed.");
  }

  const proxy = createProxyMiddleware({
    target: targetUrl.origin,
    changeOrigin: true,
    followRedirects: true,
    secure: targetUrl.protocol === "https:",
    logLevel: "warn",
    pathRewrite: () => `${targetUrl.pathname}${targetUrl.search}`,
  });

  return proxy(req, res, next);
});

app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Proxy server listening on port ${port}`);
});