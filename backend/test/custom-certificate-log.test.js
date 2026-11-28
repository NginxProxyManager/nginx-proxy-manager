/**
 * Regression test for #5545: writing a custom certificate must not put the private key
 * (or any other certificate content) into the logs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it, mock } from "node:test";

const KEYS_FILE = "/data/keys.json";
const FAKE_KEY = "FAKE-PRIVATE-KEY-CONTENT-FOR-TEST";
const FAKE_CERT = "FAKE-CERTIFICATE-CONTENT-FOR-TEST";

describe("internalCertificate.writeCustomCert logging", () => {
	it("does not log the certificate record, which holds the private key", async () => {
		// Loading the certificate module loads the app config, which reads or creates
		// /data/keys.json. Fake that one file and use an in memory database, so the test
		// does not need a writable /data.
		const realExists = fs.existsSync;
		const realRead = fs.readFileSync;
		const exists = mock.method(fs, "existsSync", (p, ...rest) => p === KEYS_FILE || realExists(p, ...rest));
		const read = mock.method(fs, "readFileSync", (p, ...rest) =>
			p === KEYS_FILE ? JSON.stringify({ key: "test", pub: "test" }) : realRead(p, ...rest),
		);
		const oldDbFile = process.env.DB_SQLITE_FILE;
		process.env.DB_SQLITE_FILE = ":memory:";
		let info;
		try {
			const { default: internalCertificate } = await import("../internal/certificate.js");
			const { ssl: logger } = await import("../logger.js");
			info = mock.method(logger, "info", () => {});

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
			info?.mock.restore();
			read.mock.restore();
			exists.mock.restore();
			if (oldDbFile === undefined) {
				delete process.env.DB_SQLITE_FILE;
			} else {
				process.env.DB_SQLITE_FILE = oldDbFile;
			}
		}
	});
});
