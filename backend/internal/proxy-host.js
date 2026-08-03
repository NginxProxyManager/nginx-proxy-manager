import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import nginxDeploymentModel from "../models/nginx_deployment.js";
import databaseNow from "../models/now_helper.js";
import proxyHostModel from "../models/proxy_host.js";
import proxyHostMonitor from "./proxy-host-monitor.js";
import internalAccessList from "./access-list.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import {
	activeArtifactPath,
	atomicWrite,
	candidateArtifactPath,
	readArtifact,
	removeArtifact,
	toLogicalPath,
} from "./nginx-config-artifacts.js";
import { sha256 } from "./nginx-config-hash.js";
import { buildProxyHostCandidate } from "./nginx-config-renderer.js";
import { validateInMirror } from "./nginx-config-validator.js";
import nginxDeploymentCoordinator, { deriveDeploymentStatus } from "./nginx-deployment-coordinator.js";
import { createDeploymentStore } from "./nginx-deployment-store.js";
import { issuePreviewToken, verifyPreviewToken } from "./nginx-preview-token.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted"];
};

const deploymentOccurredAt = () => new Date().toISOString();

const getPortListenerPort = (host) =>
	host?.nginx_config?.listener?.mode === "port" ? Number(host.nginx_config.listener.port) : null;

const assertPortListenerAvailable = async (host, excludedId) => {
	const port = getPortListenerPort(host);
	if (!Number.isInteger(port)) return;
	const query = proxyHostModel.query().where("is_deleted", 0).select("id", "nginx_config");
	if (excludedId) query.whereNot("id", excludedId);
	const rows = await query;
	if (rows.some((row) => getPortListenerPort(row) === port))
		throw new errs.ValidationError(`Port ${port} is already in use by another port listener`);
};

const previewFields = (payload) =>
	_.omit(payload, [
		"host_id",
		"base_revision",
		"preview_token",
		"id",
		"created_on",
		"modified_on",
		"owner",
		"certificate",
		"access_list",
	]);

/**
 * Resolve the same persisted dependencies the deploy path will use.  A preview
 * must not sign a rendering that was produced with a different certificate or
 * access list than the one being saved.
 */
const resolvePreviewCandidate = async (access, payload) => {
	let persisted = null;
	if (payload.host_id) {
		persisted = await internalProxyHost.get(access, {
			id: payload.host_id,
			expand: ["certificate", "access_list.[clients,items]"],
		});
	}

	const host = {
		...(persisted || {}),
		...previewFields(payload),
		id: persisted?.id ?? payload.host_id ?? payload.id ?? null,
	};
	const unresolved = [];
	let certificate = persisted?.certificate ?? null;
	let accessList = persisted?.access_list ?? null;

	if (host.certificate_id === "new") {
		unresolved.push({
			code: "CERTIFICATE_PENDING_CREATE",
			message: "A new certificate must be created before this preview can be fully validated.",
		});
		certificate = null;
	} else if (
		Number.isInteger(host.certificate_id) &&
		host.certificate_id > 0 &&
		certificate?.id !== host.certificate_id
	) {
		certificate = await internalCertificate.get(access, { id: host.certificate_id });
	}

	if (Number.isInteger(host.access_list_id) && host.access_list_id > 0 && accessList?.id !== host.access_list_id) {
		accessList = await internalAccessList.get(access, { id: host.access_list_id, expand: ["clients", "items"] });
	}

	return { host, dependencies: { certificate, access_list: accessList }, unresolved };
};

const validatePreviewInMirror = async ({ host, config }) => {
	if (!host.id)
		return {
			validation_scope: "partial",
			diagnostics: [
				{
					severity: "info",
					code: "PREVIEW_NEW_HOST",
					message: "A new host has no active artifact path yet, so only static validation was performed.",
				},
			],
		};
	try {
		await fs.access("/usr/sbin/nginx");
	} catch {
		return {
			validation_scope: "partial",
			diagnostics: [
				{
					severity: "warning",
					code: "NGINX_BINARY_UNAVAILABLE",
					message: "The nginx binary is unavailable in this runtime; only static validation was performed.",
				},
			],
		};
	}

	const operationId = `preview-${randomUUID()}`;
	const candidatePath = candidateArtifactPath(
		"proxy_host",
		host.id,
		operationId,
		nginxDeploymentCoordinator.nginxRoot,
	);
	const targetPath = activeArtifactPath("proxy_host", host.id, nginxDeploymentCoordinator.nginxRoot);
	try {
		await atomicWrite(candidatePath, config);
		const result = await validateInMirror({
			nginxRoot: nginxDeploymentCoordinator.nginxRoot,
			nginxConfigPath: nginxDeploymentCoordinator.nginxConfigPath,
			nginxPrefix: nginxDeploymentCoordinator.nginxPrefix,
			operationId,
			candidatePath,
			targetPath,
			commandRunner: nginxDeploymentCoordinator.commandRunner,
		});
		return {
			validation_scope: result.validation_scope,
			diagnostics: result.valid
				? []
				: [
						{
							severity: "error",
							code: "NGINX_TEST_FAILED",
							message: result.stderr || "nginx configuration test failed",
						},
					],
		};
	} finally {
		await removeArtifact(candidatePath).catch(() => undefined);
	}
};

const assertPreviewMatchesSave = async (access, row, payload, baseRevision, previewToken, createCertificate) => {
	if (!previewToken) return;
	const verified = verifyPreviewToken(previewToken, {
		host_id: row.id,
		base_revision: baseRevision ?? row.nginx_config_revision,
	});
	if (!verified.valid)
		throw new errs.ConflictError("Nginx preview is no longer valid", "PREVIEW_TOKEN_INVALID", {
			reason: verified.reason,
			current_revision: row.nginx_config_revision,
		});
	if (createCertificate)
		throw new errs.ConflictError("Nginx preview is no longer valid", "PREVIEW_TOKEN_INVALID", {
			reason: "certificate_pending_create",
			current_revision: row.nginx_config_revision,
		});
	const candidate = await resolvePreviewCandidate(access, { ...payload, host_id: row.id });
	const rendered = await buildProxyHostCandidate(candidate);
	for (const field of ["payload_hash", "dependency_hash", "template_hash", "capability_hash"]) {
		const expected = verified.data[field];
		const actual =
			field === "payload_hash"
				? rendered.payloadHash
				: field === "dependency_hash"
					? rendered.dependencyHash
					: field === "template_hash"
						? rendered.templateHash
						: rendered.capabilityHash;
		if (expected !== actual)
			throw new errs.ConflictError(
				"Nginx preview does not match the current save request",
				"PREVIEW_TOKEN_INVALID",
				{
					reason: field,
					current_revision: row.nginx_config_revision,
					expected_hash: expected,
					actual_hash: actual,
				},
			);
	}
};

const deploymentIdFor = async (operationId) => {
	const deployment = await nginxDeploymentModel.query().findOne("operation_id", operationId);
	return deployment?.id ?? null;
};

const deploymentError = (operationId, error, journal) => ({
	operation_id: operationId,
	code: error.code || "DEPLOYMENT_FAILED",
	message: error.message,
	diagnostics: error.diagnostics ?? null,
	journal_phase: journal.phase,
	occurred_at: deploymentOccurredAt(),
});

/** Persist Applied only after the coordinator has swapped, reloaded, and
 * successfully committed. This keeps Desired durable even when a deployment
 * fails and makes an old active artifact explicitly visible as degraded. */
const deployProxyHost = async (host) => {
	const deploymentStore = createDeploymentStore({ ownerUserId: host.owner_user_id });
	return nginxDeploymentCoordinator.deploy({
		hostType: "proxy_host",
		host,
		dependencies: { certificate: host.certificate, access_list: host.access_list },
		operation: "proxy_host_deploy",
		deploymentStore,
		beforeCommit: async ({ operationId }) => {
			await proxyHostModel
				.query()
				.where("id", host.id)
				.patch({
					nginx_deployment_status: "pending",
					nginx_last_error: null,
					nginx_checked_at: databaseNow(),
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
		commitApplied: async ({ operationId, rendered }) => {
			const meta = _.assign({}, host.meta, { nginx_online: true, nginx_err: null });
			await proxyHostModel
				.query()
				.where("id", host.id)
				.patch({
					meta,
					nginx_applied_revision: host.nginx_config_revision,
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
			const previous = await proxyHostModel.query().findById(host.id);
			const status = deriveDeploymentStatus({
				...previous,
				active_hash: previous?.nginx_applied_hash,
				deployment_state: "failed",
			});
			const meta = _.assign({}, previous?.meta, { nginx_online: false, nginx_err: error.message });
			await proxyHostModel
				.query()
				.where("id", host.id)
				.patch({
					meta,
					nginx_deployment_status: status,
					nginx_checked_at: databaseNow(),
					nginx_last_error: deploymentError(operationId, error, journal),
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
	});
};

const removeProxyHostArtifact = async (host, statusWhenApplied = "disabled") => {
	const deploymentStore = createDeploymentStore({ ownerUserId: host.owner_user_id });
	return nginxDeploymentCoordinator.remove({
		hostType: "proxy_host",
		host,
		operation: "proxy_host_remove",
		deploymentStore,
		beforeCommit: async ({ operationId }) => {
			await proxyHostModel
				.query()
				.where("id", host.id)
				.patch({
					nginx_deployment_status: "pending",
					nginx_checked_at: databaseNow(),
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
		commitApplied: async ({ operationId }) => {
			const meta = _.assign({}, host.meta, { nginx_online: false, nginx_err: null });
			await proxyHostModel
				.query()
				.where("id", host.id)
				.patch({
					meta,
					nginx_applied_revision: host.nginx_config_revision,
					nginx_applied_enabled: 0,
					nginx_applied_hash: null,
					nginx_deployment_status: statusWhenApplied,
					nginx_checked_at: databaseNow(),
					nginx_last_error: null,
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
		commitFailure: async ({ operationId, error, journal }) => {
			const previous = await proxyHostModel.query().findById(host.id);
			const meta = _.assign({}, previous?.meta, {
				nginx_online: Boolean(previous?.nginx_applied_enabled),
				nginx_err: error.message,
			});
			await proxyHostModel
				.query()
				.where("id", host.id)
				.patch({
					meta,
					nginx_deployment_status: previous?.nginx_applied_enabled ? "degraded" : "error",
					nginx_checked_at: databaseNow(),
					nginx_last_error: deploymentError(operationId, error, journal),
					nginx_last_deployment_id: await deploymentIdFor(operationId),
				});
		},
	});
};

const internalProxyHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		let thisData = data;
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		return access
			.can("proxy_hosts:create", thisData)
			.then(() => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				thisData.domain_names.map((domain_name) => {
					domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name));
					return true;
				});

				return Promise.all(domain_name_check_promises).then((check_results) => {
					check_results.map((result) => {
						if (result.is_taken) {
							throw new errs.ValidationError(`${result.hostname} is already in use`);
						}
						return true;
					});
				});
			})
			.then(async () => {
				await assertPortListenerAvailable(thisData);
				// At this point the domains should have been checked
				thisData.owner_user_id = access.token.getUserId(1);
				thisData = internalHost.cleanSslHstsData(thisData);

				// Fix for db field not having a default value
				// for this optional field.
				if (typeof thisData.advanced_config === "undefined") {
					thisData.advanced_config = "";
				}

				return proxyHostModel.query().insertAndFetch(thisData).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (createCertificate) {
					return internalCertificate
						.createQuickCertificate(access, thisData)
						.then((cert) => {
							// update host with cert id
							return internalProxyHost.update(access, {
								id: row.id,
								certificate_id: cert.id,
							});
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then((row) => {
				// re-fetch with cert
				return internalProxyHost.get(access, {
					id: row.id,
					expand: ["certificate", "owner", "access_list.[clients,items]"],
				});
			})
			.then(async (row) => {
				// Desired is already durable at this point, so audit it before the
				// deployment attempt. A deployment failure must not turn a successful
				// create into an ambiguous HTTP 500 that encourages a duplicate retry.
				thisData.meta = _.assign({}, thisData.meta || {}, row.meta);
				await internalAuditLog.add(access, {
					action: "created",
					object_type: "proxy-host",
					object_id: row.id,
					meta: thisData,
				});

				await deployProxyHost(row).catch(() => undefined);
				return internalProxyHost.get(access, {
					id: row.id,
					expand: ["certificate", "owner", "access_list.[clients,items]"],
				});
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		let thisData = data;
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}
		const baseRevision = thisData.base_revision;
		const previewToken = thisData.preview_token;
		delete thisData.base_revision;
		delete thisData.preview_token;

		return access
			.can("proxy_hosts:update", thisData.id)
			.then((/*access_data*/) => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				if (typeof thisData.domain_names !== "undefined") {
					thisData.domain_names.map((domain_name) => {
						return domain_name_check_promises.push(
							internalHost.isHostnameTaken(domain_name, "proxy", thisData.id),
						);
					});

					return Promise.all(domain_name_check_promises).then((check_results) => {
						check_results.map((result) => {
							if (result.is_taken) {
								throw new errs.ValidationError(`${result.hostname} is already in use`);
							}
							return true;
						});
					});
				}
			})
			.then(() => {
				return internalProxyHost.get(access, {
					id: thisData.id,
					expand: ["certificate", "access_list.[clients,items]"],
				});
			})
			.then(async (row) => {
				await assertPortListenerAvailable(
					{ ...row, ...thisData, nginx_config: thisData.nginx_config ?? row.nginx_config },
					row.id,
				);
				if (typeof baseRevision !== "undefined" && baseRevision !== row.nginx_config_revision) {
					throw new errs.ConflictError("Proxy Host has changed", "REVISION_CONFLICT", {
						current_revision: row.nginx_config_revision,
					});
				}
				await assertPreviewMatchesSave(access, row, thisData, baseRevision, previewToken, createCertificate);

				if (row.id !== thisData.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`Proxy Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
					);
				}

				if (createCertificate) {
					return internalCertificate
						.createQuickCertificate(access, {
							domain_names: thisData.domain_names || row.domain_names,
							meta: _.assign({}, row.meta, thisData.meta),
						})
						.then((cert) => {
							// update host with cert id
							thisData.certificate_id = cert.id;
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then((row) => {
				// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
				thisData = _.assign(
					{},
					{
						domain_names: row.domain_names,
					},
					data,
				);

				thisData = internalHost.cleanSslHstsData(thisData, row);

				return proxyHostModel
					.query()
					.where({ id: thisData.id, nginx_config_revision: row.nginx_config_revision })
					.patch({
						...thisData,
						nginx_config_revision: (row.nginx_config_revision || 1) + 1,
						nginx_deployment_status: row.enabled || thisData.enabled ? "pending" : "disabled",
					})
					.then(utils.omitRow(omissions()))
					.then((saved_row) => {
						// Add to audit log
						return internalAuditLog
							.add(access, {
								action: "updated",
								object_type: "proxy-host",
								object_id: row.id,
								meta: thisData,
							})
							.then(() => {
								return saved_row;
							});
					});
			})
			.then(() => {
				return internalProxyHost
					.get(access, {
						id: thisData.id,
						expand: ["owner", "certificate", "access_list.[clients,items]"],
					})
					.then((row) => {
						if (!row.enabled) {
							// No need to add nginx config if host is disabled
							return row;
						}
						// Configure nginx
						return deployProxyHost(row)
							.catch(() => undefined)
							.then(() =>
								internalProxyHost.get(access, {
									id: row.id,
									expand: ["owner", "certificate", "access_list.[clients,items]"],
								}),
							)
							.then((updated) => _.omit(internalHost.cleanRowCertificateMeta(updated), omissions()));
					});
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: (access, data) => {
		const thisData = data || {};
		return access
			.can("proxy_hosts:get", thisData.id)
			.then((access_data) => {
				const query = proxyHostModel
					.query()
					.where("is_deleted", 0)
					.andWhere("id", thisData.id)
					.allowGraph(proxyHostModel.defaultAllowGraph)
					.first();

				if (access_data.permission_visibility !== "all") {
					query.andWhere("owner_user_id", access.token.getUserId(1));
				}

				if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
					query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}
				const thisRow = internalHost.cleanRowCertificateMeta(row);
				// Custom omissions
				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(row, thisData.omit);
				}
				return thisRow;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access
			.can("proxy_hosts:delete", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						is_deleted: 1,
						nginx_config_revision: (row.nginx_config_revision || 1) + 1,
						nginx_deployment_status: "pending",
					})
					.then(() =>
						removeProxyHostArtifact(
							{ ...row, is_deleted: true, nginx_config_revision: (row.nginx_config_revision || 1) + 1 },
							"deleted",
						),
					)
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "proxy-host",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: (access, data) => {
		return access
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, {
					id: data.id,
					expand: ["certificate", "owner", "access_list"],
				});
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (row.enabled) {
					throw new errs.ValidationError("Host is already enabled");
				}

				row.enabled = 1;

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 1,
						nginx_config_revision: (row.nginx_config_revision || 1) + 1,
						nginx_deployment_status: "pending",
					})
					.then(() =>
						deployProxyHost({
							...row,
							enabled: true,
							nginx_config_revision: (row.nginx_config_revision || 1) + 1,
						}),
					)
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "enabled",
							object_type: "proxy-host",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: (access, data) => {
		return access
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (!row.enabled) {
					throw new errs.ValidationError("Host is already disabled");
				}

				row.enabled = 0;

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 0,
						nginx_config_revision: (row.nginx_config_revision || 1) + 1,
						nginx_deployment_status: "pending",
					})
					.then(() =>
						removeProxyHostArtifact(
							{ ...row, enabled: false, nginx_config_revision: (row.nginx_config_revision || 1) + 1 },
							"disabled",
						),
					)
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "disabled",
							object_type: "proxy-host",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * Returns the actual active artifact and the last failed candidate without
	 * accepting caller-controlled filesystem paths.
	 */
	getNginxArtifacts: async (access, id, includeContent = []) => {
		const row = await internalProxyHost.get(access, { id });
		const deployedPath = activeArtifactPath("proxy_host", row.id);
		const deployedContent = await readArtifact(deployedPath);
		let candidate = null;
		if (row.nginx_last_deployment_id && row.nginx_last_error?.operation_id) {
			const candidatePath = candidateArtifactPath("proxy_host", row.id, row.nginx_last_error.operation_id);
			const content = await readArtifact(candidatePath);
			if (content !== null)
				candidate = {
					logical_path: toLogicalPath(candidatePath),
					hash: sha256(Buffer.from(content)),
					...(includeContent.includes("candidate") ? { config: content } : {}),
				};
		}
		const activeHash = deployedContent === null ? null : sha256(Buffer.from(deployedContent));
		const status = row.nginx_deployment_status || (row.enabled ? "pending" : "disabled");
		return {
			host_id: row.id,
			status,
			desired_revision: row.nginx_config_revision ?? 1,
			applied_revision: row.nginx_applied_revision ?? null,
			deployed:
				deployedContent === null
					? null
					: {
							logical_path: toLogicalPath(deployedPath),
							hash: activeHash,
							...(includeContent.includes("deployed") ? { config: deployedContent } : {}),
						},
			candidate,
			last_error: row.nginx_last_error ?? null,
			last_checked_at: row.nginx_checked_at ?? null,
		};
	},

	previewNginxConfig: async (access, payload) => {
		if (payload.host_id) await access.can("proxy_hosts:update", payload.host_id);
		else await access.can("proxy_hosts:create", payload);
		const candidate = await resolvePreviewCandidate(access, payload);
		const result = await buildProxyHostCandidate(candidate);
		const mirror = candidate.unresolved.length
			? { validation_scope: "partial", diagnostics: [] }
			: await validatePreviewInMirror({ host: candidate.host, config: result.config });
		const diagnostics = [
			...result.diagnostics,
			...candidate.unresolved.map((item) => ({ severity: "warning", ...item })),
			...mirror.diagnostics,
		];
		const valid = !diagnostics.some((item) => item.severity === "error");
		return {
			valid,
			config: result.config,
			payload_hash: result.payloadHash,
			hash: result.configHash,
			dependency_hash: result.dependencyHash,
			capability_hash: result.capabilityHash,
			template_version: result.templateVersion,
			template_hash: result.templateHash,
			base_revision: payload.base_revision ?? null,
			preview_token:
				valid && !candidate.unresolved.length && mirror.validation_scope === "full"
					? issuePreviewToken({
							hostId: candidate.host.id,
							baseRevision: payload.base_revision ?? null,
							payloadHash: result.payloadHash,
							dependencyHash: result.dependencyHash,
							templateHash: result.templateHash,
							capabilityHash: result.capabilityHash,
						})
					: null,
			validation_scope: mirror.validation_scope,
			unresolved_dependencies: candidate.unresolved,
			diagnostics,
		};
	},

	/**
	 * All Hosts
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("proxy_hosts:list");

		const query = proxyHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph(proxyHostModel.defaultAllowGraph)
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("domain_names"), "like", `%${searchQuery}%`);
			});
		}

		const includeMonitoring = Array.isArray(expand) && expand.includes("monitoring");
		const graphExpand = Array.isArray(expand) ? expand.filter((item) => item !== "monitoring") : null;
		if (graphExpand?.length) {
			query.withGraphFetched(`[${graphExpand.join(", ")}]`);
		}

		const rows = await query.then(utils.omitRows(omissions()));
		if (includeMonitoring) {
			const statuses = await proxyHostMonitor.listStatuses(rows);
			for (const row of rows) row.monitoring_status = statuses.get(row.id);
		}
		if (graphExpand?.includes("certificate")) {
			return internalHost.cleanAllRowsCertificateMeta(rows);
		}
		return rows;
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: (user_id, visibility) => {
		const query = proxyHostModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		return query.first().then((row) => {
			return Number.parseInt(row.count, 10);
		});
	},
};

export default internalProxyHost;
