import { describe, expect, it } from "vitest";
import en from "./src/en.json";
import uz from "./src/uz.json";

const english = en as Record<string, { defaultMessage: string }>;
const uzbek = uz as Record<string, { defaultMessage: string }>;

// Brand names, codes and ICU-only strings can stay the same as English.
const allowedIdentical = new Set([
	"certificates.key-type-ecdsa",
	"certificates.key-type-rsa",
	"column.ssl",
	"dead-host",
	"lets-encrypt",
	"object.actions-title",
	"role.admin",
	"streams.tcp",
	"streams.udp",
]);

const extractIcuArgs = (message: string): string[] => {
	const args = new Set<string>();
	let depth = 0;
	for (let i = 0; i < message.length; i++) {
		if (message[i] === "{") {
			if (depth === 0) {
				const match = /^\{\s*([a-zA-Z0-9_]+)\s*(?:,|\})/.exec(message.slice(i));
				if (match) {
					args.add(match[1]);
				}
			}
			depth++;
		} else if (message[i] === "}") {
			depth = Math.max(0, depth - 1);
		}
	}
	return Array.from(args).sort();
};

describe("Uzbek UI locale", () => {
	it("covers every English UI key", () => {
		const missing = Object.keys(english).filter((key) => !(key in uzbek));
		expect(missing).toEqual([]);
	});

	it("does not add keys that are missing from English", () => {
		const extra = Object.keys(uzbek).filter((key) => !(key in english));
		expect(extra).toEqual([]);
	});

	it("is translated, not an English copy", () => {
		const identical = Object.keys(english).filter(
			(key) => uzbek[key]?.defaultMessage === english[key]?.defaultMessage,
		);
		const unexpected = identical.filter((key) => !allowedIdentical.has(key));
		expect(unexpected).toEqual([]);
	});

	it("keeps ICU data placeholders from English strings", () => {
		const broken: string[] = [];

		for (const key of Object.keys(english)) {
			const expected = extractIcuArgs(english[key].defaultMessage).join(",");
			const actual = extractIcuArgs(uzbek[key]?.defaultMessage ?? "").join(",");
			if (expected !== actual) {
				broken.push(`${key}: expected {${expected}} got {${actual}}`);
			}
		}

		expect(broken).toEqual([]);
	});
});
