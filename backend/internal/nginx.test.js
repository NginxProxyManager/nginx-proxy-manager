import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getNginxFileStem } from "../lib/utils.js";
import internalNginx from "./nginx.js";

describe("internalNginx.getConfigName", () => {
	it("returns default host path unchanged", () => {
		assert.equal(internalNginx.getConfigName("default", {}), "/data/nginx/default_host/site.conf");
	});

	it("returns id-only basename when HTTP host has no domains", () => {
		assert.equal(
			internalNginx.getConfigName("proxy_host", { id: 10, domain_names: [] }),
			"/data/nginx/proxy_host/10.conf",
		);
	});

	it("returns id.domain basename when HTTP host has domains", () => {
		assert.equal(
			internalNginx.getConfigName("proxy_host", { id: 5, domain_names: ["www.TEST.example"] }),
			"/data/nginx/proxy_host/5.www.test.example.conf",
		);
	});

	it("returns id.port basename for streams", () => {
		assert.equal(
			internalNginx.getConfigName("stream", { id: 2, incoming_port: 9000 }),
			"/data/nginx/stream/2.9000.conf",
		);
	});

	it("falls back to id only for unknown host types", () => {
		assert.equal(
			internalNginx.getConfigName("future_host_kind", { id: 42, domain_names: ["ignored.example"] }),
			"/data/nginx/future_host_kind/42.conf",
		);
	});

	it("config path uses the same stem as utils.getNginxFileStem", () => {
		const nice = "proxy_host";
		const host = { id: 7, domain_names: ["sync.test"] };
		const stem = getNginxFileStem(nice, host);
		assert.equal(internalNginx.getConfigName(nice, host), `/data/nginx/${nice}/${stem}.conf`);
	});
});

describe("internalNginx.renameStaleLogsAfterConfigWrite", () => {
	it("no-ops for host kinds without per-host logs", () => {
		assert.doesNotThrow(() => internalNginx.renameStaleLogsAfterConfigWrite("default", { id: 1 }));
	});

	it("no-ops when host id is missing", () => {
		assert.doesNotThrow(() => internalNginx.renameStaleLogsAfterConfigWrite("proxy_host", {}));
	});
});
