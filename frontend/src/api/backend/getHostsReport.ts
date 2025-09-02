import * as api from "./base";

export async function getHostsReport(abortController?: AbortController): Promise<Record<string, number>> {
	return await api.get(
		{
			url: "/reports/hosts",
		},
		abortController,
	);
}
