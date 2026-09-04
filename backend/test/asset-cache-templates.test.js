import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import utils from "../lib/utils.js";
import internalNginx from "../internal/nginx.js";

const render = async (templateName, data) => {
	const template = fs.readFileSync(new URL(`../templates/${templateName}`, import.meta.url), "utf8");
	return utils.getRenderEngine().parseAndRender(template, data);
};

test("renders a numeric asset cache lifetime", async () => {
	const config = await render("_assets.conf", {
		asset_cache_ttl: 21600,
		caching_enabled: true,
		certificate: null,
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
		path: "/assets",
		ssl_forced: false,
	});

	assert.match(config, /location \/assets \{/);
	assert.match(config, /proxy_cache_valid any 3600s;/);
});

test("retains the 30-minute lifetime when no value is provided", async () => {
	const config = await render("_assets.conf", { caching_enabled: true });
	assert.match(config, /proxy_cache_valid any 1800s;/);
	assert.match(config, /expires 1800s;/);
});

test("does not emit a cache location when caching is disabled", async () => {
	const config = await render("_assets.conf", { caching_enabled: false, asset_cache_ttl: 3600 });
	assert.equal(config.trim(), "");
});

test("propagates the host lifetime when rendering its custom locations", async () => {
	const config = await internalNginx.renderLocations({
		asset_cache_ttl: 86400,
		caching_enabled: true,
		locations: [
			{
				path: "/custom",
				forward_scheme: "http",
				forward_host: "127.0.0.1",
				forward_port: 8080,
				advanced_config: "",
			},
		],
	});
	assert.match(config, /location \/custom \{/);
	assert.match(config, /proxy_cache_valid any 86400s;/);
	assert.match(config, /expires 86400s;/);
});
