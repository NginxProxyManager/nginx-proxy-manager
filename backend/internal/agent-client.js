import errs from "../lib/error.js";
import agentModel from "../models/agent.js";

const tokenCache = new Map();

function publicAgent(agent) {
	return `${agent.name || agent.id} (${agent.url})`;
}

function trimBaseUrl(url) {
	return String(url || "").replace(/\/$/, "");
}

async function parsePayload(response) {
	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		return await response.json();
	}
	return await response.text();
}

async function request(agent, path, options = {}) {
	const url = `${trimBaseUrl(agent.url)}${path}`;
	const response = await fetch(url, options);
	const payload = await parsePayload(response);
	if (!response.ok) {
		const message = payload?.error?.message || payload?.message || payload || `HTTP ${response.status}`;
		const err = new errs.ValidationError(`Agent ${publicAgent(agent)} request failed: ${message}`);
		err.status = response.status;
		throw err;
	}
	return { response, payload };
}

async function getToken(agent, force = false) {
	const cached = tokenCache.get(agent.id || agent.url);
	if (!force && cached?.token && new Date(cached.expires).getTime() > Date.now() + 60000) {
		return cached.token;
	}

	const { payload } = await request(agent, "/api/tokens", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			identity: agent.identity,
			secret: agent.secret,
		}),
	});

	if (payload?.requires_2fa) {
		throw new errs.ValidationError(`Agent ${publicAgent(agent)} requires 2FA; use a non-2FA service account`);
	}
	if (!payload?.token) {
		throw new errs.ValidationError(`Agent ${publicAgent(agent)} did not return a token`);
	}
	tokenCache.set(agent.id || agent.url, payload);
	return payload.token;
}

function buildForwardPath(req) {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(req.query || {})) {
		if (["agent_id", "agent", "node"].includes(key)) {
			continue;
		}
		if (Array.isArray(value)) {
			value.forEach((item) => {
				query.append(key, item);
			});
		} else if (typeof value !== "undefined" && value !== null) {
			query.append(key, value);
		}
	}
	const qs = query.toString();
	return `/api${req.baseUrl}${req.path}${qs ? `?${qs}` : ""}`;
}

function appendUpload(formData, fieldName, file) {
	if (Array.isArray(file)) {
		file.forEach((entry) => {
			appendUpload(formData, fieldName, entry);
		});
		return;
	}
	formData.append(fieldName, new Blob([file.data], { type: file.mimetype }), file.name);
}

function buildForwardBody(req, headers) {
	if (["GET", "HEAD"].includes(req.method)) {
		return undefined;
	}

	if (req.files && Object.keys(req.files).length) {
		const formData = new FormData();
		for (const [key, value] of Object.entries(req.body || {})) {
			formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
		}
		for (const [key, file] of Object.entries(req.files)) {
			appendUpload(formData, key, file);
		}
		return formData;
	}

	headers["Content-Type"] = "application/json";
	return JSON.stringify(req.body || {});
}

async function forwardFetch(agent, req, path, token) {
	const headers = {
		Authorization: `Bearer ${token}`,
	};
	const body = buildForwardBody(req, headers);
	return await fetch(`${trimBaseUrl(agent.url)}${path}`, {
		method: req.method,
		headers,
		body,
	});
}

async function sendForwardResponse(response, res) {
	res.status(response.status);
	const contentType = response.headers.get("content-type") || "";
	const contentDisposition = response.headers.get("content-disposition");
	if (contentType) {
		res.set("content-type", contentType);
	}
	if (contentDisposition) {
		res.set("content-disposition", contentDisposition);
	}

	if (contentType.includes("application/json")) {
		res.send(await response.json());
		return;
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	res.send(buffer);
}

const internalAgentClient = {
	findRequestedAgentId: (req) => req.query.agent_id || req.query.agent || req.query.node,

	shouldForward: (req) => {
		const agentId = internalAgentClient.findRequestedAgentId(req);
		return agentId && agentId !== "local" && agentId !== "0";
	},

	getAgent: async (id) => {
		const agent = await agentModel.query().where("id", Number.parseInt(id, 10)).andWhere("is_deleted", 0).first();
		if (!agent?.id || !agent.enabled) {
			throw new errs.ItemNotFoundError(`agent ${id}`);
		}
		return agent;
	},

	health: async (agent) => {
		const { payload } = await request(agent, "/api", { method: "GET" });
		await getToken(agent, true);
		return {
			ok: true,
			version: payload.version,
			setup: payload.setup,
			checked_on: new Date().toISOString(),
		};
	},

	forward: async (req, res) => {
		const agent = await internalAgentClient.getAgent(internalAgentClient.findRequestedAgentId(req));
		let token = await getToken(agent);
		const path = buildForwardPath(req);
		let response = await forwardFetch(agent, req, path, token);
		if (response.status === 401) {
			token = await getToken(agent, true);
			response = await forwardFetch(agent, req, path, token);
		}
		await sendForwardResponse(response, res);
	},
};

export default internalAgentClient;
