import * as api from "./base";
import type { WebhookEndpoint } from "./getWebhooks";

export async function createWebhook(data: {
	name: string;
	url: string;
	events: string[];
	secret?: string;
	isEnabled?: boolean;
}): Promise<WebhookEndpoint & { secret?: string }> {
	return await api.post({ url: "/webhooks", data });
}
