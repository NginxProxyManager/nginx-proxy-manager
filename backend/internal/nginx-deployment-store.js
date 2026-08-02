import nginxDeploymentModel from "../models/nginx_deployment.js";
import databaseNow from "../models/now_helper.js";
import { toLogicalPath } from "./nginx-config-artifacts.js";

/**
 * Small persistence adapter deliberately kept out of the deployment
 * coordinator. The coordinator can therefore be exercised without a database,
 * while production receives a durable operation timeline for diagnostics and
 * startup reconciliation.
 */
export const createDeploymentStore = ({
	nginxRoot = "/data/nginx",
	ownerUserId = null,
	parentOperationId = null,
} = {}) => ({
	create: async (deployment) => {
		// Coordinator journals use ISO-8601 timestamps, but MariaDB DATETIME does
		// not accept values such as `2026-08-01T13:57:13.098Z` in strict mode.
		// Keep database timestamps database-native for both SQLite and MariaDB.
		const timestamp = databaseNow();
		await nginxDeploymentModel.query().insert({
			...deployment,
			parent_operation_id: parentOperationId,
			owner_user_id: ownerUserId,
			started_on: timestamp,
			created_on: timestamp,
			modified_on: timestamp,
		});
	},
	transition: async (operationId, state, rendered = null, error = null) => {
		const patch = {
			state,
		};
		if (rendered) {
			patch.payload_hash = rendered.payloadHash;
			patch.dependency_hash = rendered.dependencyHash;
			patch.template_version = rendered.templateVersion;
			patch.template_hash = rendered.templateHash;
			patch.capability_hash = rendered.capabilityHash;
			patch.config_hash = rendered.configHash;
			patch.diagnostics = rendered.diagnostics;
		}
		if (error) patch.journal_summary = { error };
		if (["applied", "failed", "rolled_back", "recovered_rollback"].includes(state))
			patch.finished_on = databaseNow();
		await nginxDeploymentModel.query().where("operation_id", operationId).patch(patch);
	},
	setCandidatePath: async (operationId, path) => {
		await nginxDeploymentModel
			.query()
			.where("operation_id", operationId)
			.patch({ candidate_path: toLogicalPath(path, nginxRoot) });
	},
});

export default { createDeploymentStore };
