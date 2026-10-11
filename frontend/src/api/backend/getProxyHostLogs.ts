import * as api from "./base";

export async function getProxyHostLogs(id: number, type: "access" | "error" = "access"): Promise<{ logs: string }> {
	return await api.get({
		url: `/nginx/proxy-hosts/${id}/logs`,
		params: { type },
	});
}
