import * as api from "./base";

export async function getUpstreamNginxConfig(
	id: number,
	params = {},
): Promise<string> {
	const { result } = await api.get({
		url: `/upstreams/${id}/nginx-config`,
		params,
	});
	return result;
}
