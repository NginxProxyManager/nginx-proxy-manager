import assert from "node:assert/strict";
import { test } from "node:test";
import { getPublicPorts, renderPublicPortsConfig } from "./public-ports.js";

test("uses standard ports when deployment variables are absent", () => {
	assert.deepEqual(getPublicPorts({}), { http: 80, https: 443 });
	assert.match(renderPublicPortsConfig(getPublicPorts({})), /default "";/);
	assert.doesNotMatch(renderPublicPortsConfig(getPublicPorts({})), /error_page/);
});

test("shares custom ports with the API and produces the HTTPS redirect suffix", () => {
	const ports = getPublicPorts({ PUBLIC_HTTP_PORT: "232", PUBLIC_HTTPS_PORT: "233" });
	assert.deepEqual(ports, { http: 232, https: 233 });
	assert.match(renderPublicPortsConfig(ports), /default ":233";/);
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
