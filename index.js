const express = require("express");
const https = require("https");
const http = require("http");
const zlib = require("zlib");

const app = express();
app.disable("x-powered-by");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(v = "") {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function toProxyUrl(base, raw, pageOrigin) {
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("javascript:") || raw.startsWith("#")) return raw;
  try {
    const abs = new URL(raw, pageOrigin).href;
    return `${base}/proxy?url=${encodeURIComponent(abs)}`;
  } catch { return raw; }
}

function rewriteHtml(html, proxyBase, pageOrigin) {
  // Rewrite src / href / action / data-src attributes
  html = html.replace(
    /((?:src|href|action|data-src|data-href|srcset)\s*=\s*)(["'])([^"']*)\2/gi,
    (_, attr, q, val) => {
      if (attr.toLowerCase().includes("srcset")) {
        const rewritten = val.split(",").map(part => {
          const [u, ...rest] = part.trim().split(/\s+/);
          return [toProxyUrl(proxyBase, u, pageOrigin), ...rest].join(" ");
        }).join(", ");
        return `${attr}${q}${rewritten}${q}`;
      }
      return `${attr}${q}${toProxyUrl(proxyBase, val, pageOrigin)}${q}`;
    }
  );

  // Rewrite CSS url() inside style attributes and <style> blocks
  html = html.replace(/url\(\s*(["']?)(?!data:)([^"')]+)\1\s*\)/gi, (_, q, u) =>
    `url(${q}${toProxyUrl(proxyBase, u, pageOrigin)}${q})`
  );

  // Rewrite @import in inline styles
  html = html.replace(/@import\s+(["'])([^"']+)\1/gi, (_, q, u) =>
    `@import ${q}${toProxyUrl(proxyBase, u, pageOrigin)}${q}`
  );

  // Inject intercept script before </head>
  const script = `<script>
(function(){
  var P="${proxyBase}",O="${pageOrigin}";
  function wrap(u){
    if(!u||u.startsWith("#")||u.startsWith("javascript:")||u.startsWith("blob:")||u.startsWith("data:"))return u;
    try{return P+"/proxy?url="+encodeURIComponent(new URL(u,O).href);}catch(e){return u;}
  }
  document.addEventListener("click",function(e){
    var a=e.target.closest("a[href]");
    if(!a)return;
    var h=a.getAttribute("href");
    if(!h||h.startsWith("#")||h.startsWith("javascript:"))return;
    e.preventDefault();
    window.location.href=wrap(h);
  },true);
  document.addEventListener("submit",function(e){
    var f=e.target;
    var action=f.getAttribute("action")||O;
    f.action=wrap(action);
  },true);
  var _fetch=window.fetch;
  window.fetch=function(u,opts){
    try{if(typeof u==="string")u=wrap(u);}catch(e){}
    return _fetch(u,opts);
  };
  var _open=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    try{u=wrap(u);}catch(e){}
    return _open.apply(this,[m,u].concat(Array.prototype.slice.call(arguments,2)));
  };
  history.pushState=new Proxy(history.pushState,{
    apply:function(t,_,args){
      try{if(args[2])args[2]=wrap(args[2]);}catch(e){}
      return Reflect.apply(t,history,args);
    }
  });
})();
</script>`;

  if (html.includes("</head>")) {
    html = html.replace("</head>", script + "</head>");
  } else {
    html = script + html;
  }

  return html;
}

function rewriteCss(css, proxyBase, pageOrigin) {
  css = css.replace(/url\(\s*(["']?)(?!data:)([^"')]+)\1\s*\)/gi, (_, q, u) =>
    `url(${q}${toProxyUrl(proxyBase, u, pageOrigin)}${q})`
  );
  css = css.replace(/@import\s+(["'])([^"']+)\1/gi, (_, q, u) =>
    `@import ${q}${toProxyUrl(proxyBase, u, pageOrigin)}${q}`
  );
  return css;
}

// ─── Page Shell ──────────────────────────────────────────────────────────────

function pageShell() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Portal</title>
  <style>
    :root{color-scheme:dark;--bg:#08111f;--bg2:#0c1730;--panel:rgba(9,16,31,0.74);--border:rgba(159,179,255,0.18);--text:#edf3ff;--muted:#9fb0d0;--accent:#6ea8ff;}
    *{box-sizing:border-box;}
    body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:radial-gradient(circle at top left,rgba(110,168,255,0.2),transparent 40%),radial-gradient(circle at bottom right,rgba(157,123,255,0.15),transparent 40%),linear-gradient(160deg,var(--bg),var(--bg2));}
    body::before{content:"";position:fixed;inset:0;pointer-events:none;
      background-image:linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);
      background-size:45px 45px;mask-image:radial-gradient(circle at center,black 30%,transparent 100%);opacity:0.4;}
    .container{position:relative;width:min(700px,95%);padding:60px 40px;background:var(--panel);border:1px solid var(--border);border-radius:32px;backdrop-filter:blur(24px);text-align:center;z-index:10;}
    .eyebrow{display:inline-block;padding:6px 14px;border-radius:99px;background:rgba(110,168,255,0.1);color:var(--accent);font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;margin-bottom:20px;}
    h1{font-size:clamp(32px,5vw,48px);margin:0 0 16px;letter-spacing:-0.04em;background:linear-gradient(135deg,#fff 0%,#a8c8ff 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
    p{color:var(--muted);font-size:17px;margin-bottom:40px;}
    .omnibox{display:flex;gap:12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);padding:10px;border-radius:20px;transition:all .3s;}
    .omnibox:focus-within{border-color:var(--accent);background:rgba(0,0,0,0.4);box-shadow:0 0 0 4px rgba(110,168,255,0.15);}
    input{flex:1;background:transparent;border:none;color:white;padding:12px 16px;font-size:18px;outline:none;}
    .btn{background:linear-gradient(135deg,#6ea8ff,#9d7bff);color:#08111f;border:none;padding:0 32px;border-radius:14px;font-weight:700;font-size:16px;cursor:pointer;transition:transform .2s;}
    .btn:hover{transform:scale(1.05);}
    .footer{margin-top:32px;font-size:13px;color:#5a6b8a;}
    .chips{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:28px;}
    .chip{padding:5px 14px;border-radius:99px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--muted);font-size:13px;cursor:pointer;text-decoration:none;transition:background .2s;}
    .chip:hover{background:rgba(110,168,255,0.15);color:var(--accent);}
  </style>
</head>
<body>
  <div class="container">
    <div class="eyebrow">Cloud Proxy v3.1</div>
    <h1>Portal</h1>
    <div class="chips">
      <a class="chip" href="/proxy?url=https://old.reddit.com">Reddit</a>
      <a class="chip" href="/proxy?url=https://en.wikipedia.org">Wikipedia</a>
      <a class="chip" href="/proxy?url=https://news.ycombinator.com">HN</a>
      <a class="chip" href="/proxy?url=https://lite.cnn.com">CNN Lite</a>
    </div>
    <p>Enter a URL or search with DuckDuckGo.</p>
    <form action="/go" method="get" class="omnibox">
      <input type="text" name="q" placeholder="reddit.com or search term..." autocomplete="off" autofocus required/>
      <button type="submit" class="btn">Go</button>
    </form>
    <div class="footer">Searches via DuckDuckGo &middot; Audio &amp; Video enabled</div>
  </div>
</body>
</html>`;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => res.send(pageShell()));

app.get("/go", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.redirect("/");

  const isUrl =
    /^https?:\/\//i.test(query) ||
    /^([a-z0-9]+([\-.][a-z0-9]+)*\.[a-z]{2,6})(:[0-9]{1,5})?(\/.*)?$/i.test(query) ||
    query === "localhost";

  if (isUrl) {
    const target = /^https?:\/\//i.test(query) ? query : `https://${query}`;
    return res.redirect(`/proxy?url=${encodeURIComponent(target)}`);
  }

  // DuckDuckGo Lite - plain HTML, proxy-friendly
  const ddg = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  return res.redirect(`/proxy?url=${encodeURIComponent(ddg)}`);
});

// ─── Proxy ───────────────────────────────────────────────────────────────────

app.use("/proxy", (req, res) => {
  const rawTarget = req.query.url;
  if (!rawTarget) return res.status(400).send("No URL provided.");

  let targetUrl;
  try { targetUrl = new URL(rawTarget); }
  catch { return res.status(400).send("Invalid URL."); }

  // Reddit: use old.reddit.com (plain HTML), but leave CDN/media hosts alone
  const isRedditPage =
    /^(www\.)?reddit\.com$/.test(targetUrl.hostname) ||
    (targetUrl.hostname.endsWith(".reddit.com") &&
      !targetUrl.hostname.includes("redditstatic") &&
      !targetUrl.hostname.includes("redd.it") &&
      !targetUrl.hostname.includes("redditmedia") &&
      !targetUrl.hostname.includes("reddituploads"));
  if (isRedditPage) targetUrl.hostname = "old.reddit.com";

  const proxyBase = `${req.protocol}://${req.get("host")}`;
  const pageOrigin = targetUrl.origin;

  const reqHeaders = {
    host: targetUrl.hostname,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "upgrade-insecure-requests": "1",
    "sec-fetch-dest": req.headers["sec-fetch-dest"] || "document",
    "sec-fetch-mode": req.headers["sec-fetch-mode"] || "navigate",
    "sec-fetch-site": "none",
    "cache-control": "no-cache",
  };
  if (req.headers.cookie) reqHeaders.cookie = req.headers.cookie;
  if (req.headers.range) reqHeaders.range = req.headers.range;
  if (req.headers.referer) {
    try {
      const ref = new URL(req.headers.referer);
      const realRef = ref.searchParams.get("url");
      if (realRef) reqHeaders.referer = realRef;
    } catch {}
  }

  const options = {
    hostname: targetUrl.hostname,
    path: `${targetUrl.pathname}${targetUrl.search}`,
    method: req.method,
    headers: reqHeaders,
    rejectUnauthorized: false,
  };

  const proto = targetUrl.protocol === "https:" ? https : http;

  const proxyReq = proto.request(options, (proxyRes) => {
    const resHeaders = { ...proxyRes.headers };

    // Strip restrictive headers
    for (const h of [
      "content-security-policy", "content-security-policy-report-only",
      "x-frame-options", "strict-transport-security", "x-content-type-options"
    ]) delete resHeaders[h];

    resHeaders["access-control-allow-origin"] = "*";
    resHeaders["access-control-allow-methods"] = "GET, POST, OPTIONS";
    resHeaders["access-control-allow-headers"] = "*";

    // Fix cookies - strip Secure/SameSite so they work over HTTP
    if (resHeaders["set-cookie"]) {
      resHeaders["set-cookie"] = resHeaders["set-cookie"].map(c =>
        c.replace(/;\s*secure/gi, "").replace(/;\s*samesite=[^;]*/gi, "")
      );
    }

    // Rewrite redirect Location headers to stay in proxy
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && resHeaders.location) {
      let loc = resHeaders.location;
      if (loc.startsWith("//")) loc = `${targetUrl.protocol}${loc}`;
      else if (loc.startsWith("/")) loc = `${pageOrigin}${loc}`;
      else if (!/^https?:\/\//i.test(loc)) loc = `${pageOrigin}/${loc}`;
      resHeaders.location = `${proxyBase}/proxy?url=${encodeURIComponent(loc)}`;
      res.writeHead(proxyRes.statusCode, resHeaders);
      return res.end();
    }

    const ct = (resHeaders["content-type"] || "").split(";")[0].toLowerCase().trim();
    const isHtml = ct === "text/html";
    const isCss = ct === "text/css";

    // Binary/media: stream straight through without buffering
    if (!isHtml && !isCss) {
      res.writeHead(proxyRes.statusCode, resHeaders);
      return proxyRes.pipe(res);
    }

    // Text content: decompress → rewrite URLs → send
    delete resHeaders["content-encoding"];
    delete resHeaders["content-length"];

    const enc = proxyRes.headers["content-encoding"];
    let stream = proxyRes;
    if (enc === "gzip")    stream = proxyRes.pipe(zlib.createGunzip());
    else if (enc === "deflate") stream = proxyRes.pipe(zlib.createInflate());
    else if (enc === "br") stream = proxyRes.pipe(zlib.createBrotliDecompress());

    const chunks = [];
    stream.on("data", c => chunks.push(c));
    stream.on("end", () => {
      let body = Buffer.concat(chunks).toString("utf8");
      body = isHtml
        ? rewriteHtml(body, proxyBase, pageOrigin)
        : rewriteCss(body, proxyBase, pageOrigin);
      res.writeHead(proxyRes.statusCode, resHeaders);
      res.end(body, "utf8");
    });
    stream.on("error", err => {
      console.error("stream error:", err.message);
      if (!res.headersSent) res.status(502).send("Stream error.");
    });
  });

  proxyReq.on("error", err => {
    console.error("proxy error:", err.message);
    if (!res.headersSent) res.status(502).send(`Could not reach ${targetUrl.hostname}: ${err.message}`);
  });

  req.pipe(proxyReq);
});

// ─── Start ────────────────────────────────────────────────────────────────────

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`Proxy ready on port ${port}`));