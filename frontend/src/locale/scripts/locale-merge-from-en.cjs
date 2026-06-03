#!/usr/bin/env node
/**
 * Copy missing translation keys from en.json into other locale files (English fallback).
 */
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "../src");
const SOURCE = "en.json";
const KEYS_FROM_EN = [
	"api-key",
	"api-keys",
	"api-keys.copy-once",
	"api-keys.revoke-confirm",
	"api-keys.subtitle",
	"credential",
	"credential-provider",
	"credential-providers",
	"credential-providers.subtitle",
	"credential-providers.test-oidc",
	"credential-providers.test-resolve",
	"credential-providers.resolve-path",
	"credentials",
	"credentials.secret-path",
	"credentials.source",
	"credentials.source.external",
	"credentials.source.internal",
	"credentials.source.manual",
	"credentials.stored",
	"credentials.subtitle",
	"credentials.migrate",
	"credentials.migrate.summary",
	"webhook",
	"webhooks",
	"webhooks.signing-secret",
	"webhooks.subtitle",
];

const en = JSON.parse(fs.readFileSync(path.join(DIR, SOURCE), "utf8"));

const files = fs
	.readdirSync(DIR)
	.filter((f) => f.endsWith(".json") && f !== "lang-list.json" && f !== SOURCE);

let totalAdded = 0;

for (const file of files) {
	const filePath = path.join(DIR, file);
	const locale = JSON.parse(fs.readFileSync(filePath, "utf8"));
	let added = 0;

	for (const key of KEYS_FROM_EN) {
		if (!locale[key] && en[key]) {
			locale[key] = en[key];
			added++;
		}
	}

	if (added > 0) {
		fs.writeFileSync(filePath, `${JSON.stringify(locale, null, "\t")}\n`, "utf8");
		totalAdded += added;
		console.log(`${file}: +${added} keys`);
	}
}

console.log(`Done. Added ${totalAdded} keys across ${files.length} locales.`);
