import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import agentModel from "../models/agent.js";
import internalAgentClient from "./agent-client.js";

const omissions = () => ["is_deleted", "secret"];

function normalizeUrl(url) {
	try {
		const parsed = new URL(url);
		parsed.pathname = parsed.pathname.replace(/\/$/, "");
		parsed.search = "";
		parsed.hash = "";
		return parsed.toString().replace(/\/$/, "");
	} catch {
		throw new errs.ValidationError("Invalid agent URL");
	}
}

const internalAgent = {
	getAll: async (access) => {
		await access.can("users:list");
		return agentModel
			.query()
			.where("is_deleted", 0)
			.orderBy("name", "ASC")
			.then(utils.omitRows(omissions()));
	},

	get: async (access, data) => {
		await access.can("users:list");
		const row = await agentModel.query().where("id", data.id).andWhere("is_deleted", 0).first();
		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		return utils.omitRow(omissions())(row);
	},

	create: async (access, data) => {
		await access.can("users:list");
		const row = await agentModel.query().insertAndFetch({
			name: data.name,
			url: normalizeUrl(data.url),
			identity: data.identity,
			secret: data.secret,
			enabled: typeof data.enabled === "undefined" ? true : data.enabled,
			meta: {},
		});
		return utils.omitRow(omissions())(row);
	},

	update: async (access, data) => {
		await access.can("users:list");
		const existing = await agentModel.query().where("id", data.id).andWhere("is_deleted", 0).first();
		if (!existing?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		const patch = {};
		["name", "identity", "enabled"].forEach((key) => {
			if (typeof data[key] !== "undefined") {
				patch[key] = data[key];
			}
		});
		if (typeof data.url !== "undefined") {
			patch.url = normalizeUrl(data.url);
		}
		if (typeof data.secret === "string" && data.secret.length) {
			patch.secret = data.secret;
		}
		await agentModel.query().where("id", data.id).patch(patch);
		return internalAgent.get(access, { id: data.id });
	},

	delete: async (access, data) => {
		await access.can("users:list");
		const existing = await agentModel.query().where("id", data.id).andWhere("is_deleted", 0).first();
		if (!existing?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		await agentModel.query().where("id", data.id).patch({ is_deleted: 1 });
		return true;
	},

	test: async (access, data) => {
		await access.can("users:list");
		let agent;
		if (data.id) {
			agent = await agentModel.query().where("id", data.id).andWhere("is_deleted", 0).first();
		} else {
			agent = {
				url: normalizeUrl(data.url),
				identity: data.identity,
				secret: data.secret,
			};
		}
		if (!agent) {
			throw new errs.ItemNotFoundError(data.id);
		}
		const result = await internalAgentClient.health(agent);
		if (data.id) {
			await agentModel.query().where("id", data.id).patch({ meta: { last_test: result } });
		}
		return result;
	},
};

export default internalAgent;
