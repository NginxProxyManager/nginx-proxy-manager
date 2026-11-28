/**
 * Regression test for #5545: writing a custom certificate must not put the private key
 * (or any other certificate content) into the logs.
 */
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import internalCertificate from "../internal/certificate.js";
import { ssl as logger } from "../logger.js";

const FAKE_KEY = "FAKE-PRIVATE-KEY-CONTENT-FOR-TEST";
const FAKE_CERT = "FAKE-CERTIFICATE-CONTENT-FOR-TEST";

describe("internalCertificate.writeCustomCert logging", () => {
	it("does not log the certificate record, which holds the private key", async () => {
		const info = mock.method(logger, "info", () => {});
		try {
			// A letsencrypt row is refused after the log line and before anything is written,
			// so the test stays off the disk. Only what gets logged matters here.
			const row = {
				id: 5545,
				provider: "letsencrypt",
				meta: { certificate: FAKE_CERT, certificate_key: FAKE_KEY },
			};
			await assert.rejects(internalCertificate.writeCustomCert(row));

			assert.ok(info.mock.callCount() > 0, "expected writeCustomCert to log something");
			const logged = JSON.stringify(info.mock.calls.map((c) => c.arguments));
			assert.ok(!logged.includes(FAKE_KEY), "the private key must not appear in the log");
			assert.ok(!logged.includes(FAKE_CERT), "the certificate must not appear in the log");
		} finally {
			info.mock.restore();
		}
	});
});
