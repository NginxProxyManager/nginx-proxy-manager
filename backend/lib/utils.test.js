import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	diskConfigFilenamesToDelete,
	getLetsEncryptTempConfigBasename,
	getNginxFileBasenameForDomainHost,
	getNginxFileBasenameForStream,
	getNginxFileStem,
	letsencryptTempConfigFilenamesToDelete,
	sanitizeDomainForFilename,
} from "./utils.js";

describe("sanitizeDomainForFilename", () => {
	it("returns empty string for non-strings", () => {
		assert.equal(sanitizeDomainForFilename(""), "");
		assert.equal(sanitizeDomainForFilename(null), "");
		assert.equal(sanitizeDomainForFilename(undefined), "");
	});

	it("lowercases and keeps dots and hyphens", () => {
		assert.equal(sanitizeDomainForFilename("WWW.EXAMPLE.COM"), "www.example.com");
		assert.equal(sanitizeDomainForFilename("a-b.c"), "a-b.c");
	});

	it("replaces unsafe characters with underscores", () => {
		assert.equal(sanitizeDomainForFilename("*.example.com"), "_.example.com");
		assert.equal(sanitizeDomainForFilename("foo_bar.com"), "foo_bar.com");
	});

	it("collapses punctuation to underscores", () => {
		assert.equal(sanitizeDomainForFilename("@@@"), "_");
	});
});

describe("getNginxFileBasenameForDomainHost", () => {
	it("uses id only when domain_names is empty or missing", () => {
		assert.equal(getNginxFileBasenameForDomainHost({ id: 12, domain_names: [] }), "12");
		assert.equal(getNginxFileBasenameForDomainHost({ id: 12 }), "12");
	});

	it("uses id only when first domain sanitizes to empty", () => {
		assert.equal(getNginxFileBasenameForDomainHost({ id: 3, domain_names: [""] }), "3");
	});

	it("uses id.sanitized-first-domain when domain_names is non-empty", () => {
		assert.equal(
			getNginxFileBasenameForDomainHost({ id: 5, domain_names: ["app.example.com"] }),
			"5.app.example.com",
		);
		assert.equal(
			getNginxFileBasenameForDomainHost({ id: 1, domain_names: ["x.test", "y.test"] }),
			"1.x.test",
		);
	});
});

describe("getNginxFileBasenameForStream", () => {
	it("uses id.incoming_port", () => {
		assert.equal(getNginxFileBasenameForStream({ id: 9, incoming_port: 8443 }), "9.8443");
	});

	it("uses id only when incoming_port is missing", () => {
		assert.equal(getNginxFileBasenameForStream({ id: 9 }), "9");
	});
});

describe("getNginxFileStem", () => {
	it("matches basename logic for known types", () => {
		assert.equal(getNginxFileStem("proxy_host", { id: 1, domain_names: ["a.example"] }), "1.a.example");
		assert.equal(getNginxFileStem("stream", { id: 2, incoming_port: 80 }), "2.80");
		assert.equal(getNginxFileStem("future_kind", { id: 99 }), "99");
	});
});

describe("getLetsEncryptTempConfigBasename", () => {
	it("uses letsencrypt_id when certificate has no domains", () => {
		assert.equal(getLetsEncryptTempConfigBasename({ id: 4, domain_names: [] }), "letsencrypt_4");
	});

	it("uses letsencrypt_id.slug when domains exist", () => {
		assert.equal(
			getLetsEncryptTempConfigBasename({ id: 4, domain_names: ["acme.example.org"] }),
			"letsencrypt_4.acme.example.org",
		);
	});

	it("uses letsencrypt_id only when first domain sanitizes to empty", () => {
		assert.equal(getLetsEncryptTempConfigBasename({ id: 4, domain_names: [""] }), "letsencrypt_4");
	});
});

describe("diskConfigFilenamesToDelete", () => {
	it("selects id.conf, id.suffix.conf, and optionally id.suffix.conf.err", () => {
		const names = ["1.conf", "1.example.com.conf", "1.example.com.conf.err", "2.conf", "other.conf"];
		assert.deepEqual(diskConfigFilenamesToDelete(names, 1, false).sort(), ["1.conf", "1.example.com.conf"]);
		assert.deepEqual(diskConfigFilenamesToDelete(names, 1, true).sort(), [
			"1.conf",
			"1.example.com.conf",
			"1.example.com.conf.err",
		]);
	});
});

describe("letsencryptTempConfigFilenamesToDelete", () => {
	it("selects letsencrypt_id.conf and letsencrypt_id.slug.conf", () => {
		const names = ["letsencrypt_3.conf", "letsencrypt_3.app.example.conf", "letsencrypt_4.conf"];
		assert.deepEqual(letsencryptTempConfigFilenamesToDelete(names, 3).sort(), [
			"letsencrypt_3.app.example.conf",
			"letsencrypt_3.conf",
		]);
	});
});
