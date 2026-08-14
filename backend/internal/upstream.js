import _ from "lodash";
import errs from "../lib/error.js";
import nginxDeploymentModel from "../models/nginx_deployment.js";
import databaseNow from "../models/now_helper.js";
import proxyHostUpstreamModel from "../models/proxy_host_upstream.js";
import upstreamModel from "../models/upstream.js";
import upstreamServerModel from "../models/upstream_server.js";
import internalAuditLog from "./audit-log.js";
import { activeArtifactPath, candidateArtifactPath, readArtifact, toLogicalPath } from "./nginx-config-artifacts.js";
import { sha256 } from "./nginx-config-hash.js";
import { buildUpstreamCandidate, normalizeUpstreamServerHost } from "./nginx-config-renderer.js";
import { validateInMirror } from "./nginx-config-validator.js";
import nginxDeploymentCoordinator, { deriveDeploymentStatus } from "./nginx-deployment-coordinator.js";
import { createDeploymentStore } from "./nginx-deployment-store.js";

const omissions = () => ["is_deleted", "owner.is_deleted"];
const NGINX_KEY = /^[a-z][a-z0-9_-]{0,62}$/;
const DURATION = /^(?:0|[1-9]\d*)(?:ms|s|m|h|d|w|M|y)?$/;
const METHODS = new Set(["round_robin", "least_conn", "ip_hash", "random"]);
const ZONE_SIZE = /^[1-9]\d*(?:[kKmMgG])?$/;

const deploymentError = (operationId, error, journal) => ({
	operation_id: operationId,
	code: error.code || "DEPLOYMENT_FAILED",
	message: error.message,
	diagnostics: error.diagnostics ?? null,
	journal_phase: journal.phase,
	occurred_at: new Date().toISOString(),
});

const deploymentIdFor = async (operationId) => {
	const deployment = await nginxDeploymentModel.query().findOne("operation_id", operationId);
	return deployment?.id ?? null;
};

const normalizeKey = (value) =>
	String(value ?? "")
		.trim()
		.toLowerCase();

const assertServer = (server, index) => {
	const label = `servers[${index}]`;
	let host;
	try {
		host = normalizeUpstreamServerHost(server.host);
	} catch {
		throw new errs.ValidationError(`${label}.host is invalid`);
	}
	const port = Number(server.port);
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		throw new errs.ValidationError(`${label}.port must be between 1 and 65535`);
	for (const field of ["weight", "max_fails"]) {
		const value = Number(server[field] ?? (field === "weight" ? 1 : 1));
		if (!Number.isInteger(value) || value < 0 || value > 65535)
			throw new errs.ValidationError(`${label}.${field} must be between 0 and 65535`);
	}
	if (!DURATION.test(String(server.fail_timeout ?? "10s")))
		throw new errs.ValidationError(`${label}.fail_timeout is not an nginx duration`);
	if (server.max_conns !== null && typeof server.max_conns !== "undefined") {
		const maxConns = Number(server.max_conns);
		if (!Number.isInteger(maxConns) || maxConns < 1 || maxConns > 65535)
			throw new errs.ValidationError(`${label}.max_conns must be between 1 and 65535`);
	}
	return {
		host,
		port,
		weight: Number(server.weight ?? 1),
		max_fails: Number(server.max_fails ?? 1),
		fail_timeout: String(server.fail_timeout ?? "10s"),
		max_conns:
			server.max_conns === null || typeof server.max_conns === "undefined" ? null : Number(server.max_conns),
		backup: Boolean(server.backup),
		down: Boolean(server.down),
		sort_order: Number.isInteger(Number(server.sort_order)) ? Number(server.sort_order) : index,
	};
};

const normalizePayload = (data, { creating = false } = {}) => {
	const result = {};
	if (typeof data.name !== "undefined") {
		result.name = String(data.name).trim();
		if (!result.name || result.name.length > 255)
			throw new errs.ValidationError("name must be between 1 and 255 characters");
	}
	if (creating || typeof data.nginx_key !== "undefined") {
		result.nginx_key = normalizeKey(data.nginx_key);
		if (!NGINX_KEY.test(result.nginx_key))
			throw new errs.ValidationError("nginx_key must match ^[a-z][a-z0-9_-]{0,62}$");
	}
	if (typeof data.load_balancing_method !== "undefined") {
		result.load_balancing_method = String(data.load_balancing_method);
		if (!METHODS.has(result.load_balancing_method))
			throw new errs.ValidationError("load_balancing_method is invalid");
	}
	if (typeof data.zone_size !== "undefined") {
		result.zone_size = String(data.zone_size).toLowerCase();
		if (!ZONE_SIZE.test(result.zone_size)) throw new errs.ValidationError("zone_size is invalid");
	}
	if (typeof data.is_disabled !== "undefined") result.is_disabled = Boolean(data.is_disabled);
	if (typeof data.servers !== "undefined") {
		if (!Array.isArray(data.servers) || !data.servers.length)
			throw new errs.ValidationError("At least one upstream server is required");
		result.servers = data.servers.map(assertServer);
	}
	return result;
};

const fetchUpstream = async (access, id, expand = ["owner", "servers"], { forUpdate = false } = {}) => {
	const accessData = await access.can("upstreams:get", id);
	const query = upstreamModel
		.query()
		.where("upstream.id", id)
		.where("upstream.is_deleted", 0)
		.allowGraph(upstreamModel.defaultAllowGraph)
		.first();
	if (forUpdate) query.forUpdate();
	if (accessData.permission_visibility !== "all") query.where("upstream.owner_user_id", access.token.getUserId(1));
	if (expand?.length) query.withGraphFetched(`[${expand.join(",")}]`);
	const row = await query;
	if (!row) throw new errs.ItemNotFoundError(id);
	return row;
};

const getMutationAccess = async (access, id) => {
	await access.can("upstreams:update", id);
	return {
		permission_visibility: (await access.can("upstreams:get", id)).permission_visibility,
		owner_user_id: access.token.getUserId(1),
	};
};

const fetchRawUpstreamForMutation = async (id, trx, accessData) => {
	const query = upstreamModel.query(trx).where("id", id).where("is_deleted", 0).forUpdate().first();
	if (accessData.permission_visibility !== "all") query.where("owner_user_id", accessData.owner_user_id);
	const row = await query;
	if (!row) throw new errs.ItemNotFoundError(id);
	return row;
};

const deployUpstream = async (upstream) => {
	const deploymentStore = createDeploymentStore({ ownerUserId: upstream.owner_user_id });
	return nginxDeploymentCoordinator.deploy({
		hostType: "upstream",
		host: upstream,
		operation: "upstream_deploy",
		deploymentStore,
		beforeCommit: async ({ operationId }) => {
			await upstreamModel
				.query()
				.where("id", upstream.id)
				.patch({
					nginx_deployment_status: "pending",
					nginx_last_error: null,
					nginx_checked_at: databaseNow(),
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
		commitApplied: async ({ operationId, rendered }) => {
			await upstreamModel
				.query()
				.where("id", upstream.id)
				.patch({
					nginx_applied_revision: upstream.nginx_config_revision,
					nginx_applied_enabled: 1,
					nginx_applied_hash: rendered.configHash,
					nginx_applied_snapshot: rendered.snapshot,
					nginx_deployment_status: "online",
					nginx_checked_at: databaseNow(),
					nginx_last_error: null,
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
		commitFailure: async ({ operationId, error, journal }) => {
			const previous = await upstreamModel.query().findById(upstream.id);
			const status = deriveDeploymentStatus({
				...previous,
				enabled: !previous?.is_disabled,
				active_hash: previous?.nginx_applied_hash,
				deployment_state: "failed",
			});
			await upstreamModel
				.query()
				.where("id", upstream.id)
				.patch({
					nginx_deployment_status: status,
					nginx_checked_at: databaseNow(),
					nginx_last_error: deploymentError(operationId, error, journal),
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
	});
};

const removeUpstreamArtifact = async (upstream) => {
	const deploymentStore = createDeploymentStore({ ownerUserId: upstream.owner_user_id });
	return nginxDeploymentCoordinator.remove({
		hostType: "upstream",
		host: upstream,
		operation: "upstream_remove",
		deploymentStore,
		beforeCommit: async ({ operationId }) => {
			await upstreamModel
				.query()
				.where("id", upstream.id)
				.patch({
					nginx_deployment_status: "pending",
					nginx_checked_at: databaseNow(),
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
		commitApplied: async ({ operationId }) => {
			await upstreamModel
				.query()
				.where("id", upstream.id)
				.patch({
					nginx_applied_revision: upstream.nginx_config_revision,
					nginx_applied_enabled: 0,
					nginx_applied_hash: null,
					nginx_deployment_status: "disabled",
					nginx_checked_at: databaseNow(),
					nginx_last_error: null,
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
		commitFailure: async ({ operationId, error, journal }) => {
			const previous = await upstreamModel.query().findById(upstream.id);
			await upstreamModel
				.query()
				.where("id", upstream.id)
				.patch({
					nginx_deployment_status: previous?.nginx_applied_enabled ? "degraded" : "error",
					nginx_checked_at: databaseNow(),
					nginx_last_error: deploymentError(operationId, error, journal),
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
	});
};

const referenceSummary = async (access, upstreamId, trx = null) => {
	const query = proxyHostUpstreamModel
		.query(trx)
		.alias("reference")
		.join("proxy_host", "proxy_host.id", "reference.proxy_host_id")
		.where("reference.upstream_id", upstreamId)
		.where("proxy_host.is_deleted", 0)
		.select(
			"reference.proxy_host_id",
			"reference.target_type",
			"reference.location_id",
			"proxy_host.domain_names",
			"proxy_host.owner_user_id",
		);
	try {
		const accessData = await access.can("proxy_hosts:list");
		if (accessData.permission_visibility !== "all")
			query.where("proxy_host.owner_user_id", access.token.getUserId(1));
		return await query;
	} catch {
		return [];
	}
};

const assertNotReferenced = async (upstreamId, trx) => {
	const rows = await proxyHostUpstreamModel
		.query(trx)
		.join("proxy_host", "proxy_host.id", "proxy_host_upstream.proxy_host_id")
		.where("proxy_host_upstream.upstream_id", upstreamId)
		.where("proxy_host.is_deleted", 0)
		.select("proxy_host_upstream.proxy_host_id")
		.forUpdate();
	if (rows.length)
		throw new errs.ConflictError("Upstream is still referenced by Proxy Hosts", "UPSTREAM_IN_USE", {
			reference_count: rows.length,
			proxy_host_ids: rows.map((row) => row.proxy_host_id),
		});
};

const getPublicRow = (row) => _.omit(row, omissions());

const internalUpstream = {
	create: async (access, data) => {
		await access.can("upstreams:create", data);
		const normalized = normalizePayload(data, { creating: true });
		const ownerUserId = access.token.getUserId(1);
		let row;
		try {
			row = await upstreamModel.transaction(async (trx) => {
				const inserted = await upstreamModel.query(trx).insertAndFetch({
					owner_user_id: ownerUserId,
					name: normalized.name,
					nginx_key: normalized.nginx_key,
					load_balancing_method: normalized.load_balancing_method ?? "round_robin",
					zone_size: normalized.zone_size ?? "64k",
					is_disabled: Boolean(normalized.is_disabled),
					nginx_config_revision: 1,
					nginx_deployment_status: normalized.is_disabled ? "disabled" : "pending",
				});
				await upstreamServerModel
					.query(trx)
					.insert(normalized.servers.map((server) => ({ ...server, upstream_id: inserted.id })));
				return inserted;
			});
		} catch (error) {
			if (/unique|duplicate/i.test(error.message || ""))
				throw new errs.ConflictError("nginx_key is already in use", "UPSTREAM_KEY_CONFLICT");
			throw error;
		}
		row = await internalUpstream.get(access, { id: row.id, expand: ["owner", "servers"] });
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "upstream",
			object_id: row.id,
			meta: row,
		});
		if (!row.is_disabled) await deployUpstream(row).catch(() => undefined);
		return internalUpstream.get(access, { id: row.id, expand: ["owner", "servers"] });
	},

	update: async (access, data) => {
		const id = Number(data.id);
		const normalized = normalizePayload(data);
		const mutationAccess = await getMutationAccess(access, id);
		let updated;
		await upstreamModel.transaction(async (trx) => {
			const current = await fetchRawUpstreamForMutation(id, trx, mutationAccess);
			if (typeof data.nginx_key !== "undefined" && normalizeKey(data.nginx_key) !== current.nginx_key)
				throw new errs.ConflictError("nginx_key cannot be changed", "UPSTREAM_KEY_IMMUTABLE");
			if (normalized.is_disabled === true && !current.is_disabled) await assertNotReferenced(id, trx);
			const patch = _.omit(normalized, ["servers", "nginx_key"]);
			const changesNginx =
				Object.keys(patch).some((field) => field !== "name") || typeof normalized.servers !== "undefined";
			if (changesNginx) {
				patch.nginx_config_revision = current.nginx_config_revision + 1;
				patch.nginx_deployment_status = "pending";
			}
			await upstreamModel.query(trx).where("id", id).patch(patch);
			if (normalized.servers) {
				await upstreamServerModel.query(trx).where("upstream_id", id).delete();
				await upstreamServerModel
					.query(trx)
					.insert(normalized.servers.map((server) => ({ ...server, upstream_id: id })));
			}
			updated = await upstreamModel.query(trx).findById(id).withGraphFetched("servers");
		});
		updated = await internalUpstream.get(access, { id, expand: ["owner", "servers"] });
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "upstream",
			object_id: id,
			meta: normalized,
		});
		if (updated.is_disabled) await removeUpstreamArtifact(updated).catch(() => undefined);
		else if (updated.nginx_config_revision !== updated.nginx_applied_revision)
			await deployUpstream(updated).catch(() => undefined);
		return internalUpstream.get(access, { id, expand: ["owner", "servers"] });
	},

	publish: async (access, id) => {
		const row = await fetchUpstream(access, id, ["owner", "servers"]);
		await access.can("upstreams:update", id);
		if (row.is_disabled) await removeUpstreamArtifact(row).catch(() => undefined);
		else await deployUpstream(row).catch(() => undefined);
		return internalUpstream.get(access, { id, expand: ["owner", "servers"] });
	},

	get: async (access, data) =>
		getPublicRow(await fetchUpstream(access, data.id, data.expand ?? ["owner", "servers"])),

	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("upstreams:list");
		const query = upstreamModel.query().where("is_deleted", 0).allowGraph(upstreamModel.defaultAllowGraph);
		if (accessData.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
		if (searchQuery)
			query.where((builder) =>
				builder.where("name", "like", `%${searchQuery}%`).orWhere("nginx_key", "like", `%${searchQuery}%`),
			);
		if (expand?.length) query.withGraphFetched(`[${expand.join(",")}]`);
		else query.withGraphFetched("servers");
		return (await query.orderBy("name", "ASC")).map(getPublicRow);
	},

	getReferences: async (access, id) => {
		await fetchUpstream(access, id, []);
		return { upstream_id: id, references: await referenceSummary(access, id) };
	},

	getNginxArtifacts: async (access, id, includeContent = []) => {
		const row = await fetchUpstream(access, id, ["servers"]);
		const deployedPath = activeArtifactPath("upstream", id);
		const candidatePath = candidateArtifactPath("upstream", id, "latest");
		const deployedContent = await readArtifact(deployedPath);
		const candidateContent = await readArtifact(candidatePath);
		return {
			upstream_id: id,
			status: row.nginx_deployment_status,
			deployed:
				deployedContent === null
					? null
					: {
							logical_path: toLogicalPath(deployedPath),
							hash: sha256(Buffer.from(deployedContent)),
							...(includeContent.includes("deployed") ? { config: deployedContent } : {}),
						},
			candidate:
				candidateContent === null
					? null
					: {
							logical_path: toLogicalPath(candidatePath),
							hash: sha256(Buffer.from(candidateContent)),
							...(includeContent.includes("candidate") ? { config: candidateContent } : {}),
						},
			last_error: row.nginx_last_error ?? null,
			last_checked_at: row.nginx_checked_at ?? null,
		};
	},

	previewNginxConfig: async (access, payload) => {
		if (payload.upstream_id) await access.can("upstreams:update", payload.upstream_id);
		else await access.can("upstreams:create", payload);
		let upstream = payload;
		if (payload.upstream_id) {
			const persisted = await fetchUpstream(access, payload.upstream_id, ["servers"]);
			upstream = { ...persisted, ...payload, servers: payload.servers ?? persisted.servers, id: persisted.id };
		}
		const normalized = normalizePayload(upstream, { creating: !payload.upstream_id });
		const candidate = {
			...upstream,
			...normalized,
			id: upstream.id ?? null,
			nginx_key: upstream.nginx_key ? normalizeKey(upstream.nginx_key) : normalized.nginx_key,
			servers: normalized.servers ?? upstream.servers,
		};
		const result = await buildUpstreamCandidate({ upstream: candidate });
		return {
			valid: true,
			config: result.config,
			hash: result.configHash,
			payload_hash: result.payloadHash,
			template_version: result.templateVersion,
			template_hash: result.templateHash,
			validation_scope: "static",
			diagnostics: [
				...result.diagnostics,
				{
					severity: "info",
					code: "NGINX_VALIDATION_ON_PUBLISH",
					message: "The full nginx configuration is validated atomically when this upstream is published.",
				},
			],
		};
	},

	getCount: (userId, visibility) => {
		const query = upstreamModel.query().count("id AS count").where("is_deleted", 0);
		if (visibility !== "all") query.andWhere("owner_user_id", userId);
		return query.first().then((row) => Number.parseInt(row.count, 10));
	},

	delete: async (access, data) => {
		const id = Number(data.id);
		const mutationAccess = await getMutationAccess(access, id);
		const row = await upstreamModel.transaction(async (trx) => {
			const current = await fetchRawUpstreamForMutation(id, trx, mutationAccess);
			await assertNotReferenced(id, trx);
			return current;
		});
		await removeUpstreamArtifact(row);
		await upstreamModel.query().where("id", id).patch({ is_deleted: 1, nginx_deployment_status: "deleted" });
		await internalAuditLog.add(access, { action: "deleted", object_type: "upstream", object_id: id, meta: row });
		return true;
	},
};

export { NGINX_KEY, normalizeKey, normalizePayload, deployUpstream, removeUpstreamArtifact };
export default internalUpstream;
