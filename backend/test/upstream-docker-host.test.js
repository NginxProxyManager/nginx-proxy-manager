import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { db, load, userAccess } from "./support/backend.js";

// Discovery users who aren't admins get the Docker provider's status: a DOCKER_HOST with credentials must not
// show up in it, nor in what is cached for the next request.
const internalUpstream = await load("internal/upstream.js");

const saved = {};
const env = {
	NPM_DOCKER_DISCOVERY: "true",
	NPM_DNS_DISCOVERY: "false",
	DOCKER_HOST: "https://admin:s3cret@docker.example:2376/?token=t0ken",
};

before(() => {
	for (const [key, value] of Object.entries(env)) {
		saved[key] = process.env[key];
		process.env[key] = value;
	}
});

after(async () => {
	for (const key of Object.keys(env)) {
		if (typeof saved[key] === "undefined") {
			delete process.env[key];
		} else {
			process.env[key] = saved[key];
		}
	}
	await db.destroy();
});

describe("upstream candidates: DOCKER_HOST with credentials", () => {
	it("returns the Docker status without the credentials, also from the cache", async () => {
		const user = userAccess({ userId: 1, visibility: "user" });
		for (const refresh of [true, false]) {
			const result = await internalUpstream.getCandidates(user, { refresh });
			const docker = result.providers.docker;
			assert.equal(docker.status, "unavailable");
			assert.equal(docker.code, "invalid_docker_host");
			assert.equal(docker.params.value, "https://***@docker.example:2376/");
			assert.doesNotMatch(JSON.stringify(result), /s3cret|t0ken|admin:/);
		}
	});
});
