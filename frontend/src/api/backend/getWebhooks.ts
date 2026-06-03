import * as api from "./base";

export interface WebhookEndpoint {
	id: number;
	name: string;
	url: string;
	events: string[];
	isEnabled: boolean;
}

export async function getWebhooks(): Promise<WebhookEndpoint[]> {
	return await api.get({ url: "/webhooks" });
}
