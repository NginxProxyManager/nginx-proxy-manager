import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import utils from "../lib/utils.js";

const render = async (templateName, data) => {
	const template = fs.readFileSync(new URL(`../templates/${templateName}`, import.meta.url), "utf8");
	return utils.getRenderEngine().parseAndRender(template, data);
};

test("renders managed gzip settings", async () => {
	const config = await render("_gzip.conf", {
		gzip_enabled: true,
		gzip_comp_level: 7,
		gzip_types: ["application/json", "text/css"],
	});

	assert.match(config, /gzip on;/);
	assert.match(config, /gzip_comp_level 7;/);
	assert.match(config, /gzip_types application\/json text\/css;/);
});

test("can disable gzip for one proxy host", async () => {
	const config = await render("_gzip.conf", {
		gzip_enabled: false,
		gzip_comp_level: 1,
		gzip_types: [],
	});

	assert.doesNotMatch(config, /gzip on;/);
	assert.match(config, /gzip off;/);
	assert.doesNotMatch(config, /gzip_types/);
});

test("renders a numeric asset cache lifetime", async () => {
	const config = await render("_assets.conf", {
		asset_cache_ttl: 21600,
		caching_enabled: true,
		certificate: null,
		http3_support: false,
	});

	assert.match(config, /proxy_cache_valid any 21600s;/);
	assert.match(config, /expires 21600s;/);
	assert.match(config, /include conf\.d\/include\/assets-common\.conf;/);
});

test("uses the proxy host cache lifetime inside custom locations", async () => {
	const config = await render("_location.conf", {
		access_list_id: 0,
		advanced_config: "",
		allow_websocket_upgrade: false,
		asset_cache_ttl: 3600,
		block_exploits: false,
		caching_enabled: true,
		certificate: null,
		forward_host: "127.0.0.1",
		forward_path: "",
		forward_port: 80,
		forward_scheme: "http",
		hsts_enabled: false,
		http3_support: false,
		path: "/assets",
		ssl_forced: false,
	});

	assert.match(config, /location \/assets \{/);
	assert.match(config, /proxy_cache_valid any 3600s;/);
});

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
