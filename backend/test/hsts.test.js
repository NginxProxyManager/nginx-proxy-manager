/**
 * $hsts_header was renamed to $hsts_header_plain/$hsts_header_subdomains, but custom configs
 * (a host's Advanced tab, custom locations) still use the old name. If nothing defines it,
 * nginx refuses to start: unknown "hsts_header" variable (#6059).
 *
 * The image defines it in proxy-variables.conf. CI only mounts backend/, so that check is
 * skipped when the file isn't there.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import utils from "../lib/utils.js";

const TEMPLATES = new URL("../templates/", import.meta.url);
const PROXY_VARIABLES = new URL("../../docker/rootfs/etc/nginx/conf.d/include/proxy-variables.conf", import.meta.url);

const render = (file, ctx) =>
	utils.getRenderEngine().parseAndRender(fs.readFileSync(new URL(file, TEMPLATES), "utf8"), ctx);

const host = (o) => ({
	certificate_id: 1,
	certificate: { provider: "letsencrypt" },
	ssl_forced: true,
	hsts_enabled: true,
	hsts_subdomains: false,
	...o,
});

describe("$hsts_header", () => {
	it("is still defined for custom configs that use it", { skip: !fs.existsSync(PROXY_VARIABLES) }, () => {
		const conf = fs.readFileSync(PROXY_VARIABLES, "utf8");
		// A literal value: proxy-variables.conf loads even when there are no hosts, so it can't
		// refer to $hsts_header_plain, which only host configs define
		assert.match(conf, /^map \$scheme \$hsts_header \{\s+https "max-age=63072000; preload";\s+\}/m);
	});

	it("is the host's own HSTS value", async () => {
		const sub = await render("_hsts.conf", host({ hsts_subdomains: true }));
		assert.match(sub, /^\s*set \$hsts_header \$hsts_header_subdomains;/m);

		const plain = await render("_hsts.conf", host({ hsts_subdomains: false }));
		assert.match(plain, /^\s*set \$hsts_header \$hsts_header_plain;/m);
	});
});
