import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import utils from "../lib/utils.js";

const render = async (templateName, data) => {
	const template = fs.readFileSync(new URL(`../templates/${templateName}`, import.meta.url), "utf8");
	return utils.getRenderEngine().parseAndRender(template, data);
};

test("renders HTTP/3 listeners and Alt-Svc only for opted-in TLS hosts", async () => {
	const data = {
		certificate: { provider: "other" },
		domain_names: ["example.com"],
		http2_support: true,
		http3_support: true,
		ipv6: true,
		public_https_port: 8443,
	};
	const listeners = await render("_listen.conf", data);
	const headers = await render("_http3_headers.conf", data);
	const socketOwner = await render("http3_listener.conf", { ipv6: true, public_https_port: 8443 });

	assert.match(listeners, /listen 443 quic;/);
	assert.match(listeners, /listen \[::\]:443 quic;/);
	assert.match(headers, /add_header Alt-Svc \$npm_http3_alt_svc always;/);
	assert.match(headers, /if \(\$scheme = https\)/);
	assert.match(headers, /h3=":8443"; ma=86400/);
	assert.match(socketOwner, /listen 443 quic reuseport default_server;/);
});

test("keeps Alt-Svc out of HTTP-only and opted-out proxy hosts", async () => {
	const httpOnly = await render("_http3_headers.conf", {
		certificate: null,
		http3_support: true,
		public_https_port: 443,
	});
	const optedOut = await render("_http3_headers.conf", {
		certificate: { provider: "other" },
		http3_support: false,
		public_https_port: 443,
	});

	assert.doesNotMatch(httpOnly, /Alt-Svc/);
	assert.doesNotMatch(optedOut, /Alt-Svc/);
});

test("adds Alt-Svc inside the asset-cache location", async () => {
	const assets = await render("_assets.conf", {
		caching_enabled: true,
		certificate: { provider: "other" },
		http3_support: true,
		public_https_port: 8443,
	});

	assert.match(assets, /location ~\* \^\.\*\\\.\(css\|js/);
	assert.match(assets, /add_header Alt-Svc \$npm_http3_alt_svc always;/);
	assert.match(assets, /include conf\.d\/include\/assets-common\.conf;/);
});
