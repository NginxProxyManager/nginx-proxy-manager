/**
 * DNS credentials that a certbot plugin is known to refuse are rejected when saved, instead of
 * failing later at issue or renewal time.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertDnsCredentialsCompatible } from "../lib/secrets/compatibility.js";

const rejects = (ini) => assert.throws(() => assertDnsCredentialsCompatible("cloudflare", ini), /not both/);
const accepts = (ini, provider = "cloudflare") =>
	assert.doesNotThrow(() => assertDnsCredentialsCompatible(provider, ini));

describe("Cloudflare credentials", () => {
	it("accepts an API token on its own", () => {
		accepts("# Cloudflare API token\ndns_cloudflare_api_token=0123456789abcdef");
	});

	it("accepts the email and Global API key on their own", () => {
		accepts("dns_cloudflare_email = me@example.com\ndns_cloudflare_api_key = 0123456789abcdef");
	});

	it("rejects an API token alongside the email and Global API key", () => {
		rejects(
			"dns_cloudflare_email = me@example.com\ndns_cloudflare_api_key = 0123456789abcdef\ndns_cloudflare_api_token = abc",
		);
	});

	it("rejects an API token alongside only one of the legacy keys", () => {
		rejects("dns_cloudflare_api_token = abc\ndns_cloudflare_email = me@example.com");
		rejects("dns_cloudflare_api_token = abc\r\ndns_cloudflare_api_key = def");
	});

	it("ignores commented-out and empty legacy keys, as certbot does", () => {
		accepts("dns_cloudflare_api_token = abc\n# dns_cloudflare_email = me@example.com\ndns_cloudflare_api_key =");
		accepts('dns_cloudflare_api_token = abc\ndns_cloudflare_email = ""');
	});

	it("leaves other providers alone", () => {
		accepts("dns_cloudflare_api_token = abc\ndns_cloudflare_email = me@example.com", "route53");
	});
});
