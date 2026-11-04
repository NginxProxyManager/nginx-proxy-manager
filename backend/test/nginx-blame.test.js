import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	attributeToHostFile,
	blameOtherHost,
	blameTests,
	blameUnattributed,
	causedByProtected,
	errorPaths,
	mentionsPath,
	regenerateOrDisable,
} from "../lib/nginx-blame.js";

const CERT = "/etc/letsencrypt/live/npm-2/fullchain.pem";
const certError = {
	file: null,
	line: null,
	message: `cannot load certificate "${CERT}": BIO_new_file() failed`,
	output: "",
};
const LOG = "/data/logs/proxy-host-5_access.log";
const LOG_ERROR = {
	file: null,
	line: null,
	message: `open() "${LOG}" failed (13: Permission denied)`,
	output: "",
};

describe("mentionsPath", () => {
	it("matches any directive but not comments", () => {
		assert.equal(mentionsPath(`  ssl_certificate ${CERT};`, CERT), true);
		assert.equal(mentionsPath(`  access_log ${CERT};`, CERT), true);
		assert.equal(mentionsPath(`  # ssl_certificate ${CERT};`, CERT), false);
	});
});

describe("attributeToHostFile", () => {
	it("keeps a parsed file", () => {
		const parsed = { file: "/data/nginx/proxy_host/9.conf", message: `"${CERT}"` };
		assert.equal(attributeToHostFile(parsed, { file: "/data/nginx/proxy_host/1.conf", text: CERT }), parsed);
	});

	it("blames the host being saved when its config mentions the path", () => {
		const own = { file: "/data/nginx/proxy_host/1.conf", text: `access_log ${CERT};` };
		assert.equal(attributeToHostFile(certError, own).file, own.file);
	});

	it("never blames another host by itself", () => {
		const own = { file: "/data/nginx/proxy_host/1.conf", text: "return 200;" };
		assert.equal(attributeToHostFile(certError, own).file, null);
		assert.equal(attributeToHostFile(certError, undefined).file, null);
	});

	it("leaves errors without a path alone", () => {
		const parsed = { file: null, message: "something broke" };
		const own = { file: "/data/nginx/proxy_host/1.conf", text: "x" };
		assert.equal(attributeToHostFile(parsed, own), parsed);
	});
});

describe("errorPaths", () => {
	it("extracts quoted absolute paths", () => {
		assert.deepEqual(errorPaths(LOG_ERROR.message), [LOG]);
		assert.deepEqual(errorPaths("no paths here"), []);
	});
});

describe("blameUnattributed", () => {
	const OWN = "/data/nginx/proxy_host/1.conf";
	const A = { file: "/data/nginx/proxy_host/5.conf", text: `access_log ${LOG} proxy;` };
	const MENTION = { file: "/data/nginx/proxy_host/7.conf", text: `# mentions\nadd_header X-Log "${LOG}";` };
	const UNRELATED = { file: "/data/nginx/dead_host/3.conf", text: "return 404;" };
	const fail = (message) => ({ ok: false, parsed: { file: null, line: null, message, output: message } });

	it("heals the host whose removal makes the test pass, after testing without the saved host", async () => {
		const calls = [];
		const out = await blameUnattributed(LOG_ERROR, {
			own: { file: OWN },
			listFiles: () => [{ file: OWN, text: "" }, UNRELATED, A],
			testWithout: async () => {
				calls.push("without-own");
				return fail(LOG_ERROR.message);
			},
			testWithoutCandidate: async (file) => {
				calls.push(file);
				return file === A.file ? { ok: true } : fail(LOG_ERROR.message);
			},
		});
		assert.equal(out.action, "heal");
		assert.deepEqual(out.other, { host_type: "proxy_host", host_id: 5 });
		assert.equal(out.parsed.file, A.file);
		// only hosts that mention the path are tried
		assert.deepEqual(calls, ["without-own", A.file]);
	});

	it("never heals on mere mention", async () => {
		const out = await blameUnattributed(LOG_ERROR, {
			own: { file: OWN },
			listFiles: () => [MENTION, A],
			testWithout: async () => fail(LOG_ERROR.message),
			testWithoutCandidate: async () => fail(LOG_ERROR.message),
		});
		assert.equal(out.action, "global");
	});

	it("picks the candidate that is really at fault, not the first mention", async () => {
		const out = await blameUnattributed(LOG_ERROR, {
			own: { file: OWN },
			listFiles: () => [MENTION, A],
			testWithout: async () => fail(LOG_ERROR.message),
			testWithoutCandidate: async (file) => (file === A.file ? { ok: true } : fail(LOG_ERROR.message)),
		});
		assert.equal(out.other.host_id, 5);
	});

	it("counts a different remaining error as progress", async () => {
		const out = await blameUnattributed(LOG_ERROR, {
			own: { file: OWN },
			listFiles: () => [A],
			testWithout: async () => fail(LOG_ERROR.message),
			testWithoutCandidate: async () => fail('cannot load certificate "/etc/x.pem"'),
		});
		assert.equal(out.action, "heal");
	});

	it("is a conflict of the saved host when the test passes without it", async () => {
		let candidates = 0;
		const out = await blameUnattributed(LOG_ERROR, {
			own: { file: OWN },
			listFiles: () => [A],
			testWithout: async () => ({ ok: true }),
			testWithoutCandidate: async () => {
				candidates++;
				return { ok: true };
			},
		});
		assert.equal(out.action, "conflict");
		assert.equal(candidates, 0);
	});

	it("handles a remaining error that names a file like blameOtherHost", async () => {
		const named = { file: "/data/nginx/stream/2.conf", line: 4, message: "x" };
		const out = await blameUnattributed(LOG_ERROR, {
			own: { file: OWN },
			listFiles: () => [A],
			testWithout: async () => ({ ok: false, parsed: named }),
			testWithoutCandidate: async () => ({ ok: true }),
		});
		assert.equal(out.action, "heal");
		assert.deepEqual(out.other, { host_type: "stream", host_id: 2 });
	});

	it("works without a saved host (reload / boot)", async () => {
		const out = await blameUnattributed(LOG_ERROR, {
			listFiles: () => [A],
			testWithoutCandidate: async () => ({ ok: true }),
		});
		assert.equal(out.action, "heal");
		assert.equal(out.other.host_id, 5);
	});

	describe("a path several hosts mention (shared certificate)", () => {
		const B = { file: "/data/nginx/proxy_host/6.conf", text: `ssl_certificate ${CERT};` };
		const C = { file: "/data/nginx/redirection_host/2.conf", text: `ssl_certificate ${CERT};` };
		const D = { file: "/data/nginx/proxy_host/8.conf", text: "return 200;" };

		it("takes all candidates out together when no single one helps, and blames all of them", async () => {
			const groups = [];
			const out = await blameUnattributed(certError, {
				own: { file: OWN },
				listFiles: () => [{ file: OWN, text: "" }, B, D, C],
				testWithout: async () => fail(certError.message),
				testWithoutCandidate: async () => fail(certError.message),
				testWithoutCandidates: async (files) => {
					groups.push(files);
					return files.includes(B.file) && files.includes(C.file) ? { ok: true } : fail(certError.message);
				},
			});
			assert.equal(out.action, "heal");
			// the saved host and hosts that don't mention the path are not part of the group
			assert.deepEqual(groups, [[B.file, C.file]]);
			assert.deepEqual(out.others, [
				{ file: B.file, host_type: "proxy_host", host_id: 6 },
				{ file: C.file, host_type: "redirection_host", host_id: 2 },
			]);
			assert.deepEqual(out.other, { host_type: "proxy_host", host_id: 6 });
		});

		it("works without a saved host (reload / boot)", async () => {
			const out = await blameUnattributed(certError, {
				listFiles: () => [B, C],
				testWithoutCandidate: async () => fail(certError.message),
				testWithoutCandidates: async () => fail('open() "/data/logs/other.log" failed'),
			});
			assert.equal(out.action, "heal");
			assert.equal(out.others.length, 2);
		});

		it("is global when the group doesn't help either", async () => {
			const out = await blameUnattributed(certError, {
				listFiles: () => [B, C],
				testWithoutCandidate: async () => fail(certError.message),
				testWithoutCandidates: async () => fail(certError.message),
			});
			assert.equal(out.action, "global");
		});

		it("is still the saved host's own error when its config mentions the path", () => {
			const own = { file: OWN, text: `ssl_certificate ${CERT};` };
			assert.equal(attributeToHostFile(certError, own).file, OWN);
		});

		it("is a conflict of the saved host when the test passes without it", async () => {
			let groups = 0;
			const out = await blameUnattributed(certError, {
				own: { file: OWN },
				listFiles: () => [B, C],
				testWithout: async () => ({ ok: true }),
				testWithoutCandidate: async () => fail(certError.message),
				testWithoutCandidates: async () => {
					groups++;
					return { ok: true };
				},
			});
			assert.equal(out.action, "conflict");
			assert.equal(groups, 0);
		});
	});

	it("is global when nothing mentions the path", async () => {
		const out = await blameUnattributed(LOG_ERROR, {
			listFiles: () => [UNRELATED],
			testWithoutCandidate: async () => ({ ok: true }),
		});
		assert.equal(out.action, "global");
	});
});

describe("causedByProtected", () => {
	const SAVED = "/data/nginx/proxy_host/1.conf";
	const never = async () => {
		throw new Error("must not test");
	};

	it("is never the case outside a nested configure", async () => {
		assert.equal(
			await causedByProtected({ parsed: { file: SAVED }, protect: [], testWithoutProtected: never }),
			false,
		);
	});

	it("is the case when the failure names the saved host's file", async () => {
		assert.equal(
			await causedByProtected({ parsed: { file: SAVED }, protect: [SAVED], testWithoutProtected: never }),
			true,
		);
		assert.equal(
			await causedByProtected({
				parsed: { file: "/data/nginx/proxy_host/5.conf" },
				protect: [SAVED],
				namesProtected: true,
				testWithoutProtected: never,
			}),
			true,
		);
	});

	it("is the case when the regenerated host passes without the saved host", async () => {
		// eg. the regenerated host and the saved host both claim `listen 80 default_server`
		const parsed = { file: "/data/nginx/proxy_host/5.conf", line: 3, message: "a duplicate default server" };
		assert.equal(
			await causedByProtected({ parsed, protect: [SAVED], testWithoutProtected: async () => ({ ok: true }) }),
			true,
		);
		assert.equal(
			await causedByProtected({
				parsed,
				protect: [SAVED],
				testWithoutProtected: async () => ({ ok: false, parsed }),
			}),
			false,
		);
	});
});

describe("regenerateOrDisable", () => {
	it("never disables when the regenerate error is an abort, passing it on", async () => {
		const abort = Object.assign(new Error("conflicts with the host being saved"), { protectedConflict: true });
		let disabled = false;
		await assert.rejects(
			regenerateOrDisable({
				enabled: true,
				depth: 0,
				regenerate: async () => {
					throw abort;
				},
				disable: async () => {
					disabled = true;
				},
				isAbort: (err) => err.protectedConflict === true,
			}),
			(err) => err === abort,
		);
		assert.equal(disabled, false);
	});

	it("regenerates an enabled host instead of disabling it", async () => {
		let disabled = false;
		const out = await regenerateOrDisable({
			enabled: true,
			depth: 0,
			regenerate: async () => {},
			disable: async () => {
				disabled = true;
			},
		});
		assert.equal(out, "regenerated");
		assert.equal(disabled, false);
	});

	it("disables when the regenerated config still fails, passing the error on", async () => {
		const failure = new Error("host level");
		let got = null;
		const out = await regenerateOrDisable({
			enabled: true,
			depth: 0,
			regenerate: async () => {
				throw failure;
			},
			disable: async (err) => {
				got = err;
			},
		});
		assert.equal(out, "disabled");
		assert.equal(got, failure);
	});

	it("does not regenerate disabled hosts or nested repairs", async () => {
		for (const opts of [
			{ enabled: false, depth: 0 },
			{ enabled: true, depth: 1 },
		]) {
			let regenerated = false;
			const out = await regenerateOrDisable({
				...opts,
				regenerate: async () => {
					regenerated = true;
				},
				disable: async () => {},
			});
			assert.equal(out, "disabled");
			assert.equal(regenerated, false);
		}
	});
});

describe("blameOtherHost", () => {
	const parsed = { file: "/data/nginx/proxy_host/2.conf", line: 3, message: "duplicate default server" };

	it("is a conflict of the saved host when the other file passes without it", async () => {
		const out = await blameOtherHost(parsed, async () => ({ ok: true }));
		assert.equal(out.action, "conflict");
		assert.equal(out.parsed, parsed);
	});

	it("heals the host whose file still fails", async () => {
		const alone = { file: "/data/nginx/dead_host/4.conf", line: 1, message: "unknown directive" };
		const out = await blameOtherHost(parsed, async () => ({ ok: false, parsed: alone }));
		assert.equal(out.action, "heal");
		assert.deepEqual(out.other, { host_type: "dead_host", host_id: 4 });
		assert.equal(out.parsed, alone);
	});

	it("is global when the remaining failure is no host file", async () => {
		const alone = { file: "/data/nginx/custom/http.conf", line: 1, message: "x" };
		const out = await blameOtherHost(parsed, async () => ({ ok: false, parsed: alone }));
		assert.equal(out.action, "global");
	});
});

describe("blameTests", () => {
	const A = "/data/nginx/proxy_host/1.conf";
	const B = "/data/nginx/proxy_host/2.conf";
	const C = "/data/nginx/proxy_host/3.conf";
	// nginx -t over A, B, C where B and C conflict (duplicate listen options), reported in C
	const nginx = (aside) => {
		if (!aside.includes(B) && !aside.includes(C)) {
			return { ok: false, parsed: { file: C, line: 1, message: "duplicate listen options", output: "" } };
		}
		return { ok: true };
	};

	it("takes the saved host out as well in a nested configure, so a third host isn't blamed", async () => {
		// A is regenerated while B (the host being saved) keeps its new config
		const calls = [];
		const tests = blameTests({
			own: A,
			protect: [B],
			testWithoutOwn: async () => nginx([A]),
			testAside: async (files) => {
				calls.push(files);
				return nginx(files);
			},
		});
		const parsed = { file: C, line: 1, message: "duplicate listen options", output: "" };
		const blame = await blameOtherHost(parsed, tests.testWithout);
		assert.equal(blame.action, "conflict");
		assert.deepEqual(calls, [[A, B]]);
		// and causedByProtected() then turns it into a conflict of the saved host
		assert.equal(
			await causedByProtected({ parsed, protect: [B], testWithoutProtected: async () => nginx([B]) }),
			true,
		);
		assert.deepEqual(await tests.testWithoutCandidate(C), { ok: true });
		assert.deepEqual(calls.at(-1), [A, B, C]);
		assert.deepEqual(calls.length, 2);
		await tests.testWithoutCandidates([C]);
		assert.deepEqual(calls.at(-1), [A, B, C]);
	});

	it("only takes the own file out outside a nested configure", async () => {
		let own = 0;
		const tests = blameTests({
			own: B,
			testWithoutOwn: async () => {
				own++;
				return nginx([B]);
			},
			testAside: async (files) => nginx(files),
		});
		const blame = await blameOtherHost({ file: C, line: 1, message: "", output: "" }, tests.testWithout);
		assert.equal(blame.action, "conflict");
		assert.equal(own, 1);
		const without = blameTests({
			own: A,
			protect: [],
			testWithoutOwn: async () => nginx([A]),
			testAside: async (files) => nginx(files),
		});
		// without the protect files, C still fails next to B: C is the one to heal
		assert.equal((await blameOtherHost({ file: C }, without.testWithout)).action, "heal");
	});
});
