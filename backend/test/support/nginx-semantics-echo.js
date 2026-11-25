// The upstream of test/nginx-semantics.test.js: answers with the URI and the Host header it received and can
// redirect. Port 9001 is the main upstream of the cached hosts and adds "upstream":"main".
import http from "node:http";

const handler = (main) => (req, res) => {
	if (req.url.startsWith("/auth")) {
		res.writeHead(req.headers["x-ok"] ? 200 : 401);
		return res.end();
	}
	const headers = { "content-type": "application/json" };
	if (req.url.includes("redir=abs")) {
		headers.location = `http://echo:9000${req.url.split("?")[0]}/next`;
		res.writeHead(302, headers);
		return res.end();
	}
	if (req.url.includes("redir=rel")) {
		headers.location = `${req.url.split("?")[0]}/next`;
		res.writeHead(302, headers);
		return res.end();
	}
	// x-sem-in: a proxy_set_header of an included snippet or of the advanced config, shown as "in"
	const body = { url: req.url, host: req.headers.host, in: req.headers["x-sem-in"] };
	res.writeHead(200, headers);
	res.end(JSON.stringify(main ? { ...body, upstream: "main" } : body));
};

const listen = (server, port) =>
	new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, () => resolve(server));
	});

/**
 * Starts the echo upstream on ports 9000 and 9001 (all addresses) and returns a function that stops it.
 */
export const startEcho = async () => {
	const servers = await Promise.all([
		listen(http.createServer(handler(false)), 9000),
		listen(http.createServer(handler(true)), 9001),
	]);
	return () => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
};
