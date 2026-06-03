import crypto from "node:crypto";
import { encrypt, decrypt } from "../lib/secrets/crypto.js";
import { ensureCredentialDirs } from "../lib/secrets/storage.js";
import fs from "node:fs";
import path from "node:path";
import webhookEndpointModel from "../models/webhook_endpoint.js";
import utils from "../lib/utils.js";
import { debug, express as logger } from "../logger.js";

const WEBHOOK_SECRETS_DIR = "/data/credentials/webhooks";

const omissions = () => ["is_deleted", "secret_path"];

const writeWebhookSecret = (id, secret) => {
	ensureCredentialDirs();
	fs.mkdirSync(WEBHOOK_SECRETS_DIR, { recursive: true, mode: 0o700 });
	const { buffer } = encrypt(secret);
	const filePath = path.join(WEBHOOK_SECRETS_DIR, `${id}.enc`);
	fs.writeFileSync(filePath, buffer, { mode: 0o600 });
	return `${id}.enc`;
};

const readWebhookSecret = (id) => {
	const filePath = path.join(WEBHOOK_SECRETS_DIR, `${id}.enc`);
	if (!fs.existsSync(filePath)) {
		return "";
	}
	return decrypt(fs.readFileSync(filePath));
};

const internalWebhook = {
	create: async (access, data) => {
		await access.can("webhooks:create", data);
		const signingSecret = data.secret || crypto.randomBytes(32).toString("hex");

		const row = await webhookEndpointModel.query().insertAndFetch({
			name: data.name,
			url: data.url,
			events: data.events,
			owner_user_id: access.token.getUserId(1),
			secret_path: "pending.enc",
			is_enabled: data.is_enabled !== false ? 1 : 0,
		});

		const secretPath = writeWebhookSecret(row.id, signingSecret);
		const saved = await webhookEndpointModel
			.query()
			.patchAndFetchById(row.id, { secret_path: secretPath })
			.then(utils.omitRow(omissions()));

		if (data.secret) {
			delete saved.secret;
		} else {
			saved.secret = signingSecret;
		}

		return saved;
	},

	getAll: async (access) => {
		await access.can("webhooks:list");
		return webhookEndpointModel
			.query()
			.where("is_deleted", 0)
			.orderBy("name", "ASC")
			.then(utils.omitRows(omissions()));
	},

	delete: async (access, data) => {
		await access.can("webhooks:delete", data.id);
		await webhookEndpointModel.query().patchAndFetchById(data.id, { is_deleted: 1 });
		return true;
	},

	dispatch: async (event, payload) => {
		const endpoints = await webhookEndpointModel
			.query()
			.where("is_deleted", 0)
			.andWhere("is_enabled", 1);

		const maxAttempts = 3;

		for (const endpoint of endpoints) {
			if (!endpoint.events?.includes(event) && !endpoint.events?.includes("*")) {
				continue;
			}

			const secret = readWebhookSecret(endpoint.id);
			const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
			const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				try {
					const response = await fetch(endpoint.url, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-NPM-Event": event,
							"X-NPM-Signature": `sha256=${signature}`,
						},
						body,
						signal: AbortSignal.timeout(10000),
					});

					if (response.ok) {
						break;
					}

					debug(logger, `Webhook ${endpoint.id} returned ${response.status} (attempt ${attempt}/${maxAttempts})`);
				} catch (err) {
					debug(logger, `Webhook ${endpoint.id} failed: ${err.message} (attempt ${attempt}/${maxAttempts})`);
				}

				if (attempt < maxAttempts) {
					await new Promise((resolve) => setTimeout(resolve, attempt * 500));
				}
			}
		}
	},
};

export default internalWebhook;
