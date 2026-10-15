import * as api from "./base";

export async function deleteWebhook(id: number): Promise<boolean> {
	return await api.del({ url: `/webhooks/${id}` });
}
