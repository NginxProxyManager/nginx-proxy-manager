import assert from "node:assert/strict";
import { after, it } from "node:test";
import { access, db, load, tick, ts } from "./support/backend.js";

const internalNginx = await load("internal/nginx.js");
const internalCertificate = await load("internal/certificate.js");
const internalAuditLog = await load("internal/audit-log.js");
const utils = await load("lib/utils.js");

after(() => db.destroy());

it("reloads nginx after a renew through the nginx lock, with the test-and-repair step", async () => {
	const [id] = await db("certificate").insert({
		owner_user_id: 1,
		provider: "letsencrypt",
		nice_name: "renew",
		domain_names: JSON.stringify(["renew.example.com"]),
		meta: "{}",
		expires_on: "2026-12-01 00:00:00",
		...ts,
	});
	const events = [];
	let renewed;
	const renewStarted = new Promise((resolve) => {
		renewed = resolve;
	});
	internalCertificate.renewLetsEncryptSsl = async () => {
		events.push("certbot renew");
		renewed();
	};
	internalCertificate.getCertificateInfoFromFile = async () => ({ dates: { to: 1830297600 } });
	internalAuditLog.add = async () => {};
	internalNginx.testAndHeal = async () => {
		events.push("nginx -t (and repair)");
	};
	utils.execFile = async (cmd, args) => {
		events.push(`${cmd} ${args.join(" ")}`);
		return "";
	};

	// another configure holds the lock: the renew's reload has to wait for it
	let release;
	const held = internalNginx.withLock(async () => {
		events.push("configure start");
		await new Promise((resolve) => {
			release = resolve;
		});
		events.push("configure end");
	});
	const renew = internalCertificate.renew(access, { id });
	// however long the certificate lookup takes; then give the renew time to (wrongly) reload without the lock
	await renewStarted;
	await tick(20);
	assert.deepEqual(events, ["configure start", "certbot renew"]);

	release();
	await held;
	const result = await renew;
	assert.deepEqual(events, [
		"configure start",
		"certbot renew",
		"configure end",
		"nginx -t (and repair)",
		"/usr/sbin/nginx -s reload",
	]);
	assert.equal(result.id, id);
	assert.match(result.expires_on, /^2028-/);
});
