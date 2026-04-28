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

  fetch(target, { headers: { "User-Agent": "Mozilla/5.0" } })
    .then(r => r.text())
    .then(html => {
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    })
    .catch(e => res.status(500).send("Error: " + e.message));
});

app.listen(process.env.PORT || 3000);