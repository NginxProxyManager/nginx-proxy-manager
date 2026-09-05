import assert from "node:assert/strict";
import test from "node:test";
import { formatVersion, getVersion, parseVersion } from "../internal/app-version.js";
import remoteVersion from "../internal/remote-version.js";

test("uses build metadata as the runtime product version", () => {
	const previous = process.env.NPM_BUILD_VERSION;
	process.env.NPM_BUILD_VERSION = "1.8.2";
	try {
		assert.deepEqual(getVersion(), { major: 1, minor: 8, revision: 2 });
		assert.equal(formatVersion(), "1.8.2");
		assert.deepEqual(parseVersion("v2.4.0"), { major: 2, minor: 4, revision: 0 });
	} finally {
		if (typeof previous === "undefined") delete process.env.NPM_BUILD_VERSION;
		else process.env.NPM_BUILD_VERSION = previous;
	}
});

test("compares stable semantic versions", () => {
	assert.equal(remoteVersion.compareVersions("1.3.1", "1.4.0"), true);
	assert.equal(remoteVersion.compareVersions("v1.3.1", "1.3.1"), false);
	assert.equal(remoteVersion.compareVersions("1.10.0", "1.9.9"), false);
	assert.equal(remoteVersion.compareVersions("invalid", "1.4.0"), false);
});

test("selects the highest stable Docker image tag", () => {
	const latest = remoteVersion.latestStableTag([
		{ name: "latest" },
		{ name: "1.3.1" },
		{ name: "1.10.0" },
		{ name: "2.0.0-rc.1" },
		{ name: "v1.9.2" },
	]);
	assert.equal(latest, "1.10.0");
	assert.equal(remoteVersion.latestStableTag([{ name: null }, {}, { name: "preview" }]), null);
	assert.equal(remoteVersion.compareVersions("1.3.2", "invalid"), false);
});

test("fetches Docker tags once, caches them, and reports update availability", async () => {
	const previousVersion = process.env.NPM_BUILD_VERSION;
	const previousFetch = remoteVersion.fetchUrl;
	const previousResult = remoteVersion.last_result;
	const previousFetchTime = remoteVersion.last_fetch_time;
	let fetches = 0;
	process.env.NPM_BUILD_VERSION = "1.3.2";
	remoteVersion.last_result = null;
	remoteVersion.last_fetch_time = null;
	remoteVersion.fetchUrl = async (url) => {
		fetches += 1;
		assert.match(url, /hub\.docker\.com/);
		return JSON.stringify({ results: [{ name: "1.3.2" }, { name: "1.4.0" }, { name: "latest" }] });
	};

	try {
		assert.deepEqual(await remoteVersion.get(), {
			current: "1.3.2",
			latest: "1.4.0",
			update_available: true,
		});
		assert.deepEqual(await remoteVersion.get(), {
			current: "1.3.2",
			latest: "1.4.0",
			update_available: true,
		});
		assert.equal(fetches, 1);

		remoteVersion.last_fetch_time = Date.now() - remoteVersion.cache_timeout - 1;
		await remoteVersion.get();
		assert.equal(fetches, 2);
	} finally {
		remoteVersion.fetchUrl = previousFetch;
		remoteVersion.last_result = previousResult;
		remoteVersion.last_fetch_time = previousFetchTime;
		if (typeof previousVersion === "undefined") delete process.env.NPM_BUILD_VERSION;
		else process.env.NPM_BUILD_VERSION = previousVersion;
	}
});

test("reports no update when the registry contains no stable tag", async () => {
	const previousVersion = process.env.NPM_BUILD_VERSION;
	const previousFetch = remoteVersion.fetchUrl;
	const previousResult = remoteVersion.last_result;
	const previousFetchTime = remoteVersion.last_fetch_time;
	process.env.NPM_BUILD_VERSION = "1.3.2";
	remoteVersion.last_result = { results: [{ name: "latest" }, { name: "2.0.0-rc.1" }] };
	remoteVersion.last_fetch_time = Date.now();
	try {
		assert.deepEqual(await remoteVersion.get(), {
			current: "1.3.2",
			latest: null,
			update_available: false,
		});
	} finally {
		remoteVersion.fetchUrl = previousFetch;
		remoteVersion.last_result = previousResult;
		remoteVersion.last_fetch_time = previousFetchTime;
		if (previousVersion === undefined) delete process.env.NPM_BUILD_VERSION;
		else process.env.NPM_BUILD_VERSION = previousVersion;
	}
});
