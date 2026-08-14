import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NginxDeploymentCoordinator, deriveDeploymentStatus } from "../../internal/nginx-deployment-coordinator.js";
import { activeArtifactPath, readArtifact } from "../../internal/nginx-config-artifacts.js";

const rendered = (config) => ({ config, configHash: `sha256:${config}`, payloadHash: "sha256:payload", dependencyHash: "sha256:deps", templateVersion: "test", templateHash: "sha256:template", capabilityHash: "sha256:cap", diagnostics: [], snapshot: {} });

const temporaryRoot = async () => fs.mkdtemp(join(os.tmpdir(), "npm-nginx-coordinator-"));

test("DEP-007 rollback preserves a prior active artifact when reload fails", async (context) => {
	const root = await temporaryRoot();
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const active = activeArtifactPath("proxy_host", 7, root);
	await fs.mkdir(join(active, ".."), { recursive: true });
	await fs.writeFile(active, "old config\n");
	let reloads = 0;
	const coordinator = new NginxDeploymentCoordinator({
		nginxRoot: root,
		renderCandidate: async () => rendered("new config\n"),
		validator: async () => ({ valid: true, stdout: "", stderr: "", validation_scope: "full" }),
		commandRunner: async (_, args) => {
			if (args.includes("reload")) throw new Error("reload failed");
			reloads += 1;
			return { stdout: "", stderr: "" };
		},
	});
	await assert.rejects(() => coordinator.deploy({ hostType: "proxy_host", host: { id: 7 } }), /reload failed/);
	assert.equal(await readArtifact(active), "old config\n");
	assert.ok(reloads >= 2, "rollback must validate/reload the restored active config");
});

test("DEP-003 validation failure never swaps the active artifact", async (context) => {
	const root = await temporaryRoot();
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const active = activeArtifactPath("proxy_host", 8, root);
	await fs.mkdir(join(active, ".."), { recursive: true });
	await fs.writeFile(active, "old config\n");
	const coordinator = new NginxDeploymentCoordinator({ nginxRoot: root, renderCandidate: async () => rendered("new config\n"), validator: async () => ({ valid: false, stderr: "invalid" }), commandRunner: async () => ({ stdout: "", stderr: "" }) });
	await assert.rejects(() => coordinator.deploy({ hostType: "proxy_host", host: { id: 8 } }), /invalid/);
	assert.equal(await readArtifact(active), "old config\n");
});

test("deployment status has one derivation order", () => {
	assert.equal(deriveDeploymentStatus({ enabled: true, nginx_applied_enabled: true, nginx_config_revision: 2, nginx_applied_revision: 2, nginx_applied_hash: "sha256:a", active_hash: "sha256:a" }), "online");
	assert.equal(deriveDeploymentStatus({ enabled: true, nginx_applied_enabled: true, nginx_config_revision: 2, nginx_applied_revision: 1, nginx_applied_hash: "sha256:a", active_hash: "sha256:a" }), "degraded");
	assert.equal(deriveDeploymentStatus({ enabled: false, nginx_applied_enabled: false, nginx_config_revision: 2, nginx_applied_revision: 2 }), "disabled");
});

test("DEP-006 removal validates before swap and restores active config when reload fails", async (context) => {
	const root = await temporaryRoot();
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const active = activeArtifactPath("proxy_host", 9, root);
	await fs.mkdir(join(active, ".."), { recursive: true });
	await fs.writeFile(active, "old config\n");
	const coordinator = new NginxDeploymentCoordinator({
		nginxRoot: root,
		validator: async () => ({ valid: true, stdout: "", stderr: "", validation_scope: "full" }),
		commandRunner: async (_, args) => {
			if (args.includes("reload")) throw new Error("reload failed");
			return { stdout: "", stderr: "" };
		},
	});
	await assert.rejects(() => coordinator.remove({ hostType: "proxy_host", host: { id: 9 } }), /reload failed/);
	assert.equal(await readArtifact(active), "old config\n");
});

test("DEP-008 recovery restores an interrupted swapped artifact", async (context) => {
	const root = await temporaryRoot();
	context.after(() => fs.rm(root, { recursive: true, force: true }));
	const active = activeArtifactPath("proxy_host", 10, root);
	const backup = join(root, ".deploy", "backups", "operation-10", "proxy_host", "10.conf");
	await fs.mkdir(join(backup, ".."), { recursive: true });
	await fs.writeFile(backup, "old config\n");
	await fs.mkdir(join(root, ".deploy", "journal"), { recursive: true });
	await fs.writeFile(join(root, ".deploy", "journal", "operation-10.json"), JSON.stringify({ operation_id: "operation-10", phase: "swapped", target: active, backup, had_active: true }));
	const coordinator = new NginxDeploymentCoordinator({ nginxRoot: root, commandRunner: async () => ({ stdout: "", stderr: "" }) });
	const recovered = await coordinator.recover();
	assert.deepEqual(recovered, [{ operationId: "operation-10", state: "recovered_rollback" }]);
	assert.equal(await readArtifact(active), "old config\n");
});
