// Answers with the URI and the Host header it received
const http = require("http");
http.createServer((req, res) => {
  if (req.url.startsWith("/auth")) { res.writeHead(req.headers["x-ok"] ? 200 : 401); return res.end(); }
  const h = { "content-type": "application/json" };
  if (req.url.includes("redir=abs")) { h.location = "http://echo:9000" + req.url.split("?")[0] + "/next"; res.writeHead(302, h); return res.end(); }
  if (req.url.includes("redir=rel")) { h.location = req.url.split("?")[0] + "/next"; res.writeHead(302, h); return res.end(); }
  res.writeHead(200, h); res.end(JSON.stringify({ url: req.url, host: req.headers.host }));
}).listen(9000);
