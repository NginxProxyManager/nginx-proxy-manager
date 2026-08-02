import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { join } from "node:path";
import utils from "../lib/utils.js";
import {
	activeArtifactPath,
	atomicWrite,
	backupArtifactPath,
	candidateArtifactPath,
	deleteJournal,
	deploymentRoot,
	readArtifact,
	readJournals,
	removeArtifact,
	stagingArtifactPath,
	writeJournal,
} from "./nginx-config-artifacts.js";
import { sha256 } from "./nginx-config-hash.js";
import { buildCandidate } from "./nginx-config-renderer.js";
import { validateInMirror } from "./nginx-config-validator.js";

const terminalStates = new Set(["applied", "failed", "rolled_back", "recovered_rollback"]);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const now = () => new Date().toISOString();

export const deriveDeploymentStatus = ({
	is_deleted,
	enabled,
	nginx_applied_enabled,
	nginx_config_revision,
	nginx_applied_revision,
	nginx_applied_hash,
	active_hash,
	deployment_state,
	has_unfinished_journal,
}) => {
	if (has_unfinished_journal) return "recovering";
	if (["queued", "preparing", "validating", "swapping", "reloading"].includes(deployment_state)) return "pending";
	if (is_deleted) return "deleted";
	if (!enabled && !nginx_applied_enabled && nginx_applied_revision === nginx_config_revision) return "disabled";
	if (
		enabled &&
		nginx_applied_enabled &&
		nginx_applied_revision === nginx_config_revision &&
		nginx_applied_hash &&
		nginx_applied_hash === active_hash
	)
		return "online";
	if (nginx_applied_enabled && nginx_applied_hash) return "degraded";
	if (enabled && !nginx_applied_enabled) return "error";
	return "degraded";
};

export class NginxDeploymentCoordinator {
	#queue = Promise.resolve();

	constructor({
		nginxRoot = "/data/nginx",
		nginxConfigPath = "/etc/nginx/nginx.conf",
		nginxPrefix = "/etc/nginx",
		commandRunner = utils.execFileResult,
		renderCandidate = buildCandidate,
		validator = validateInMirror,
		lockTimeoutMs = 30000,
		staleLockMs = 120000,
	} = {}) {
		this.nginxRoot = nginxRoot;
		this.nginxConfigPath = nginxConfigPath;
		this.nginxPrefix = nginxPrefix;
		this.commandRunner = commandRunner;
		this.renderCandidate = renderCandidate;
		this.validator = validator;
		this.lockTimeoutMs = lockTimeoutMs;
		this.staleLockMs = staleLockMs;
	}

	get lockPath() {
		return join(deploymentRoot(this.nginxRoot), "lock.json");
	}

	async #acquireLock(operationId) {
		const startedAt = Date.now();
		await fs.mkdir(deploymentRoot(this.nginxRoot), { recursive: true });
		while (Date.now() - startedAt < this.lockTimeoutMs) {
			try {
				await fs.writeFile(
					this.lockPath,
					JSON.stringify({ operation_id: operationId, pid: process.pid, started_on: now() }),
					{ flag: "wx", mode: 0o600 },
				);
				return async () => fs.rm(this.lockPath, { force: true });
			} catch (error) {
				if (error.code !== "EEXIST") throw error;
				try {
					const current = JSON.parse(await fs.readFile(this.lockPath, "utf8"));
					if (Date.now() - Date.parse(current.started_on) > this.staleLockMs) {
						await fs.rm(this.lockPath, { force: true });
						continue;
					}
				} catch (readError) {
					if (readError.code === "ENOENT") continue;
				}
				await sleep(50);
			}
		}
		const error = new Error("Timed out waiting for nginx deployment lock");
		error.code = "DEPLOYMENT_LOCK_TIMEOUT";
		throw error;
	}

	enqueue(operation) {
		const scheduled = this.#queue.then(() => operation());
		this.#queue = scheduled.catch(() => undefined);
		return scheduled;
	}

	async #nginxTest() {
		return this.commandRunner("/usr/sbin/nginx", ["-t", "-g", "error_log /dev/null crit;"]);
	}

	async #reload() {
		await this.#nginxTest();
		return this.commandRunner("/usr/sbin/nginx", ["-s", "reload"]);
	}

	/** Runs a global nginx syntax test under the same serialized lock. */
	testOnly(operation = "test") {
		return this.enqueue(async () => {
			const operationId = randomUUID();
			const release = await this.#acquireLock(`${operation}-${operationId}`);
			try {
				return await this.#nginxTest();
			} finally {
				await release().catch(() => undefined);
			}
		});
	}

	/** Reloads nginx only after the global syntax test, serialized with deploys. */
	reloadOnly(operation = "reload") {
		return this.enqueue(async () => {
			const operationId = randomUUID();
			const release = await this.#acquireLock(`${operation}-${operationId}`);
			try {
				return await this.#reload();
			} finally {
				await release().catch(() => undefined);
			}
		});
	}

	/**
	 * Deploy exactly one managed artifact. All callbacks execute in documented
	 * phases so service code can persist desired/applied state without the
	 * coordinator owning any business model.
	 */
	deploy({
		hostType,
		host,
		dependencies = {},
		capability = {},
		operation = "deploy",
		renderResult = null,
		beforeCommit = async () => undefined,
		commitApplied = async () => undefined,
		commitFailure = async () => undefined,
		deploymentStore = null,
	}) {
		return this.enqueue(async () => {
			const operationId = randomUUID();
			const target = activeArtifactPath(hostType, host.id, this.nginxRoot);
			const candidate = candidateArtifactPath(hostType, host.id, operationId, this.nginxRoot);
			const staging = stagingArtifactPath(hostType, host.id, operationId, this.nginxRoot);
			const backup = backupArtifactPath(hostType, host.id, operationId, this.nginxRoot);
			let journal = {
				operation_id: operationId,
				host_type: hostType,
				host_id: host.id,
				operation,
				phase: "queued",
				started_on: now(),
				target,
				candidate,
				staging,
				backup,
				had_active: false,
			};
			let release;
			let result;
			try {
				if (deploymentStore)
					await deploymentStore.create?.({
						operation_id: operationId,
						host_type: hostType,
						host_id: host.id,
						operation,
						state: "queued",
						requested_revision: host.nginx_config_revision ?? null,
						started_on: now(),
					});
				release = await this.#acquireLock(operationId);
				journal.phase = "preparing";
				await writeJournal(journal, this.nginxRoot);
				const rendered =
					renderResult || (await this.renderCandidate({ hostType, host, dependencies, capability }));
				await atomicWrite(candidate, rendered.config);
				if (deploymentStore) await deploymentStore.setCandidatePath?.(operationId, candidate);
				await atomicWrite(staging, rendered.config);
				journal = {
					...journal,
					phase: "validating",
					config_hash: rendered.configHash,
					candidate_hash: sha256(Buffer.from(rendered.config)),
					diagnostics: rendered.diagnostics,
				};
				await writeJournal(journal, this.nginxRoot);
				if (deploymentStore) await deploymentStore.transition?.(operationId, "validating", rendered);
				const isolated = await this.validator({
					nginxRoot: this.nginxRoot,
					nginxConfigPath: this.nginxConfigPath,
					nginxPrefix: this.nginxPrefix,
					operationId,
					candidatePath: candidate,
					targetPath: target,
					commandRunner: this.commandRunner,
				});
				if (!isolated.valid) {
					const error = new Error(isolated.stderr || "Isolated nginx validation failed");
					error.code = "NGINX_VALIDATION_FAILED";
					error.diagnostics = [
						{ severity: "error", code: "nginx_test_failed", scope: "candidate", message: isolated.stderr },
					];
					throw error;
				}
				await beforeCommit({ operationId, rendered, isolated });
				journal.phase = "swapping";
				journal.had_active = (await readArtifact(target)) !== null;
				await writeJournal(journal, this.nginxRoot);
				if (journal.had_active) {
					await fs.mkdir(join(backup, ".."), { recursive: true });
					await fs.rename(target, backup);
				}
				await fs.mkdir(join(target, ".."), { recursive: true });
				await fs.rename(staging, target);
				journal.phase = "swapped";
				await writeJournal(journal, this.nginxRoot);
				if (deploymentStore) await deploymentStore.transition?.(operationId, "reloading", rendered);
				await this.#reload();
				journal.phase = "reloaded";
				journal.reloaded_on = now();
				await writeJournal(journal, this.nginxRoot);
				await commitApplied({ operationId, rendered, isolated });
				journal.phase = "applied";
				journal.finished_on = now();
				await writeJournal(journal, this.nginxRoot);
				if (deploymentStore) await deploymentStore.transition?.(operationId, "applied", rendered);
				await deleteJournal(operationId, this.nginxRoot);
				await fs.rm(join(deploymentRoot(this.nginxRoot), "staging", operationId), {
					recursive: true,
					force: true,
				});
				result = { operationId, state: "applied", rendered, isolated };
			} catch (error) {
				let rolledBack = false;
				try {
					if (journal.phase === "swapped" || journal.phase === "reloaded") {
						await removeArtifact(target);
						if (journal.had_active) {
							await fs.mkdir(join(target, ".."), { recursive: true });
							await fs.rename(backup, target);
						}
						await this.#reload();
						rolledBack = true;
					}
				} catch (rollbackError) {
					error.rollback_error = rollbackError.message;
				}
				journal.phase = rolledBack ? "rolled_back" : "failed";
				journal.finished_on = now();
				journal.error = {
					code: error.code || "DEPLOYMENT_FAILED",
					message: error.message,
					rollback_error: error.rollback_error,
				};
				await writeJournal(journal, this.nginxRoot).catch(() => undefined);
				await commitFailure({ operationId, error, journal, rolledBack }).catch((commitError) => {
					error.commit_error = commitError.message;
				});
				if (deploymentStore)
					await deploymentStore
						.transition?.(operationId, rolledBack ? "rolled_back" : "failed", null, journal.error)
						.catch(() => undefined);
				throw error;
			} finally {
				if (release) await release().catch(() => undefined);
			}
			return result;
		});
	}

	/**
	 * Removes one managed artifact with the same validate/swap/reload/rollback
	 * guarantees as deploy(). A zero-byte candidate is validated in the isolated
	 * mirror, so the active include is never removed before Nginx accepts the
	 * resulting configuration.
	 */
	remove({
		hostType,
		host,
		operation = "remove",
		beforeCommit = async () => undefined,
		commitApplied = async () => undefined,
		commitFailure = async () => undefined,
		deploymentStore = null,
	}) {
		return this.enqueue(async () => {
			const operationId = randomUUID();
			const target = activeArtifactPath(hostType, host.id, this.nginxRoot);
			const candidate = candidateArtifactPath(hostType, host.id, operationId, this.nginxRoot);
			const backup = backupArtifactPath(hostType, host.id, operationId, this.nginxRoot);
			const journal = {
				operation_id: operationId,
				host_type: hostType,
				host_id: host.id,
				operation,
				phase: "queued",
				started_on: now(),
				target,
				candidate,
				backup,
				had_active: false,
			};
			let release;
			try {
				if (deploymentStore)
					await deploymentStore.create?.({
						operation_id: operationId,
						host_type: hostType,
						host_id: host.id,
						operation,
						state: "queued",
						requested_revision: host.nginx_config_revision ?? null,
						started_on: now(),
					});
				release = await this.#acquireLock(operationId);
				journal.phase = "preparing";
				await writeJournal(journal, this.nginxRoot);
				journal.had_active = (await readArtifact(target)) !== null;
				if (!journal.had_active) {
					await beforeCommit({
						operationId,
						rendered: null,
						isolated: { valid: true, validation_scope: "not_applicable" },
					});
					await commitApplied({
						operationId,
						rendered: null,
						isolated: { valid: true, validation_scope: "not_applicable" },
					});
					journal.phase = "applied";
					journal.finished_on = now();
					await writeJournal(journal, this.nginxRoot);
					if (deploymentStore) await deploymentStore.transition?.(operationId, "applied", null);
					await deleteJournal(operationId, this.nginxRoot);
					return {
						operationId,
						state: "applied",
						rendered: null,
						isolated: { valid: true, validation_scope: "not_applicable" },
					};
				}
				await atomicWrite(candidate, "");
				if (deploymentStore) await deploymentStore.setCandidatePath?.(operationId, candidate);
				journal.phase = "validating";
				await writeJournal(journal, this.nginxRoot);
				if (deploymentStore) await deploymentStore.transition?.(operationId, "validating", null);
				const isolated = await this.validator({
					nginxRoot: this.nginxRoot,
					nginxConfigPath: this.nginxConfigPath,
					nginxPrefix: this.nginxPrefix,
					operationId,
					candidatePath: candidate,
					targetPath: target,
					commandRunner: this.commandRunner,
				});
				if (!isolated.valid) {
					const error = new Error(isolated.stderr || "Isolated nginx validation failed");
					error.code = "NGINX_VALIDATION_FAILED";
					throw error;
				}
				await beforeCommit({ operationId, rendered: null, isolated });
				journal.phase = "swapping";
				await writeJournal(journal, this.nginxRoot);
				await fs.mkdir(join(backup, ".."), { recursive: true });
				await fs.rename(target, backup);
				journal.phase = "swapped";
				await writeJournal(journal, this.nginxRoot);
				if (deploymentStore) await deploymentStore.transition?.(operationId, "reloading", null);
				await this.#reload();
				journal.phase = "reloaded";
				await writeJournal(journal, this.nginxRoot);
				await commitApplied({ operationId, rendered: null, isolated });
				journal.phase = "applied";
				journal.finished_on = now();
				await writeJournal(journal, this.nginxRoot);
				if (deploymentStore) await deploymentStore.transition?.(operationId, "applied", null);
				await deleteJournal(operationId, this.nginxRoot);
				return { operationId, state: "applied", rendered: null, isolated };
			} catch (error) {
				let rolledBack = false;
				try {
					if (["swapped", "reloaded"].includes(journal.phase) && journal.had_active) {
						await fs.mkdir(join(target, ".."), { recursive: true });
						await fs.rename(backup, target);
						await this.#reload();
						rolledBack = true;
					}
				} catch (rollbackError) {
					error.rollback_error = rollbackError.message;
				}
				journal.phase = rolledBack ? "rolled_back" : "failed";
				journal.finished_on = now();
				journal.error = {
					code: error.code || "DEPLOYMENT_FAILED",
					message: error.message,
					rollback_error: error.rollback_error,
				};
				await writeJournal(journal, this.nginxRoot).catch(() => undefined);
				await commitFailure({ operationId, error, journal, rolledBack }).catch((commitError) => {
					error.commit_error = commitError.message;
				});
				if (deploymentStore)
					await deploymentStore
						.transition?.(operationId, rolledBack ? "rolled_back" : "failed", null, journal.error)
						.catch(() => undefined);
				throw error;
			} finally {
				if (release) await release().catch(() => undefined);
			}
		});
	}

	async recover() {
		const journals = await readJournals(this.nginxRoot);
		const recovered = [];
		for (const journal of journals) {
			if (terminalStates.has(journal.phase)) continue;
			const release = await this.#acquireLock(`recover-${journal.operation_id}`);
			try {
				if (["swapped", "reloaded"].includes(journal.phase)) {
					await removeArtifact(journal.target);
					if (journal.had_active) {
						await fs.mkdir(join(journal.target, ".."), { recursive: true });
						await fs.rename(journal.backup, journal.target);
					}
					await this.#reload();
				}
				journal.phase = "recovered_rollback";
				journal.finished_on = now();
				await writeJournal(journal, this.nginxRoot);
				recovered.push({ operationId: journal.operation_id, state: journal.phase });
			} finally {
				await release();
			}
		}
		return recovered;
	}
}

export const nginxDeploymentCoordinator = new NginxDeploymentCoordinator();
export default nginxDeploymentCoordinator;
