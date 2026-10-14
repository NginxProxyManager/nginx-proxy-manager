import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv from "ajv";
import healthSchema from "../schema/components/health-object.json" with { type: "json" };
import { getPublicPorts, renderPublicPortsConfig, renderPublicPortsServerConfig } from "./public-ports.js";

test("uses standard ports when deployment variables are absent", () => {
	assert.deepEqual(getPublicPorts({}), { http: 80, https: 443 });
	assert.match(renderPublicPortsConfig(getPublicPorts({})), /default "";/);
	assert.doesNotMatch(renderPublicPortsConfig(getPublicPorts({})), /error_page/);
	assert.equal(renderPublicPortsServerConfig(getPublicPorts({})), "");
});

test("shares custom ports with the API and produces the HTTPS redirect suffix", () => {
	const ports = getPublicPorts({ PUBLIC_HTTP_PORT: "232", PUBLIC_HTTPS_PORT: "233" });
	assert.deepEqual(ports, { http: 232, https: 233 });
	assert.match(renderPublicPortsConfig(ports), /default ":233";/);
	assert.equal(
		renderPublicPortsServerConfig(ports),
		"error_page 497 =307 https://$host$npm_public_https_port_suffix$request_uri;\n",
	);
	assert.match(
		renderPublicPortsConfig(ports),
		/error_page 497 =307 https:\/\/\$host\$npm_public_https_port_suffix\$request_uri;/,
	);
});

test("accepts the full valid port range independently for each protocol", () => {
	assert.deepEqual(getPublicPorts({ PUBLIC_HTTP_PORT: "1", PUBLIC_HTTPS_PORT: "65535" }), {
		http: 1,
		https: 65535,
	});
});

test("rejects invalid input before emitting Nginx configuration", () => {
	for (const key of ["PUBLIC_HTTP_PORT", "PUBLIC_HTTPS_PORT"]) {
		for (const value of ["", "0", "65536", "-1", "233.5", "2e2", " 233", "233; return 200;"]) {
			assert.throws(() => getPublicPorts({ [key]: value }), {
				message: `${key} must be an integer between 1 and 65535`,
			});
		}
	}
});

test("health schema accepts public ports and rejects invalid response ports", () => {
	const validate = new Ajv({ strict: false }).compile(healthSchema);
	const health = { status: "OK", version: { major: 2, minor: 16, revision: 0 } };
	for (const public_ports of [getPublicPorts({}), { http: 232, https: 233 }]) {
		assert.equal(validate({ ...health, public_ports }), true, JSON.stringify(validate.errors));
	}
	for (const public_ports of [
		{ http: 0, https: 443 },
		{ http: 80, https: 65536 },
		{ http: "232", https: 233 },
		{ http: 80 },
	]) {
		assert.equal(validate({ ...health, public_ports }), false);
	}
});
