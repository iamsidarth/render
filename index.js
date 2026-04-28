const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.get("/", (req, res) => {
  const target = req.query.url;
  if (!target) return res.send(`
    <form action="/">
      <input name="url" placeholder="https://example.com" style="width:400px"/>
      <button type="submit">Go</button>
    </form>
  `);

  fetch(target, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "identity",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1"
    }
  })
    .then(r => r.text())
    .then(html => {
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    })
    .catch(e => res.status(500).send("Error: " + e.message));
});

app.listen(process.env.PORT || 3000);