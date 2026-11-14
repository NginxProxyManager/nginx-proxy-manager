// Answers with the URI and the Host header it received. Port 9001 is the main upstream of the cached hosts
// (gen.mjs), it adds "upstream":"main".
const http = require("http");
const handler = (main) => (req, res) => {
  if (req.url.startsWith("/auth")) { res.writeHead(req.headers["x-ok"] ? 200 : 401); return res.end(); }
  const h = { "content-type": "application/json" };
  if (req.url.includes("redir=abs")) { h.location = "http://echo:9000" + req.url.split("?")[0] + "/next"; res.writeHead(302, h); return res.end(); }
  if (req.url.includes("redir=rel")) { h.location = req.url.split("?")[0] + "/next"; res.writeHead(302, h); return res.end(); }
  // x-sem-in: a proxy_set_header of an included snippet (run.sh), shown as "in"
  const body = { url: req.url, host: req.headers.host, in: req.headers["x-sem-in"] };
  res.writeHead(200, h); res.end(JSON.stringify(main ? { ...body, upstream: "main" } : body));
};
http.createServer(handler(false)).listen(9000);
http.createServer(handler(true)).listen(9001);
