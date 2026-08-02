import _ from "lodash";
import { nginx as logger } from "../logger.js";
import databaseNow from "../models/now_helper.js";
import { activeArtifactPath, readArtifact } from "./nginx-config-artifacts.js";
import nginxDeploymentCoordinator from "./nginx-deployment-coordinator.js";
import { createDeploymentStore } from "./nginx-deployment-store.js";

const deploymentStoreFor = (host) => createDeploymentStore({ ownerUserId: host?.owner_user_id ?? null });

/**
 * Compatibility facade for existing services. The legacy public API is kept so
 * callers can migrate independently, but every active-file mutation and every
 * reload now goes through NginxDeploymentCoordinator.
 */
const internalNginx = {
	configure: async (model, hostType, host) => {
		const priorMeta = host.meta || {};
		let appliedMeta = priorMeta;
		await nginxDeploymentCoordinator.deploy({
			hostType,
			host,
			dependencies: { certificate: host.certificate, access_list: host.access_list },
			operation: `${hostType}_configure`,
			deploymentStore: deploymentStoreFor(host),
			commitApplied: async ({ rendered }) => {
				appliedMeta = _.assign({}, priorMeta, { nginx_online: true, nginx_err: null });
				if (model?.query && "meta" in host)
					await model.query().where("id", host.id).patch({ meta: appliedMeta });
				// Proxy Host normal workflows use their dedicated service callbacks.
				// This fallback keeps maintenance scripts consistent with Applied state.
				if (model?.tableName === "proxy_host") {
					await model.query().where("id", host.id).patch({
						nginx_applied_revision: host.nginx_config_revision,
						nginx_applied_enabled: 1,
						nginx_applied_hash: rendered.configHash,
						nginx_applied_snapshot: rendered.snapshot,
						nginx_deployment_status: "online",
						nginx_checked_at: databaseNow(),
						nginx_last_error: null,
					});
				}
			},
			commitFailure: async ({ error }) => {
				if (model?.query && "meta" in host) {
					await model
						.query()
						.where("id", host.id)
						.patch({
							meta: _.assign({}, priorMeta, { nginx_online: false, nginx_err: error.message }),
						});
				}
			},
		});
		return appliedMeta;
	},

	generateConfig: async (hostType, host) => {
		await nginxDeploymentCoordinator.deploy({
			hostType,
			host,
			dependencies: { certificate: host.certificate, access_list: host.access_list },
			operation: `${hostType}_generate`,
			deploymentStore: deploymentStoreFor(host),
		});
	},

	deleteConfig: async (hostType, host) => {
		await nginxDeploymentCoordinator.remove({
			hostType,
			host,
			operation: `${hostType}_remove`,
			deploymentStore: deploymentStoreFor(host),
		});
	},

	bulkGenerateConfigs: async (hostType, hosts) => {
		for (const host of hosts || []) await internalNginx.generateConfig(hostType, host);
	},

	bulkDeleteConfigs: async (hostType, hosts) => {
		for (const host of hosts || []) await internalNginx.deleteConfig(hostType, host);
	},

	test: () => nginxDeploymentCoordinator.testOnly("legacy_test"),
	reload: () => nginxDeploymentCoordinator.reloadOnly("legacy_reload"),
	getConfigName: (hostType, hostId) => activeArtifactPath(hostType, hostId),
	getFileFriendlyHostType: (hostType) => hostType,
	getConfigPath: (hostType, hostId) => activeArtifactPath(hostType, hostId),
	getConfig: async (hostType, hostId) => readArtifact(activeArtifactPath(hostType, hostId)),
};

logger.debug?.("Nginx compatibility facade initialized with deployment coordinator");
export default internalNginx;
