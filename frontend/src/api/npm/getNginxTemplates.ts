import * as api from "./base";
import { NginxTemplatesResponse } from "./responseTypes";

export async function getNginxTemplates(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<NginxTemplatesResponse> {
	const { result } = await api.get(
		{
			url: "nginx-templates",
			params: { limit, offset, sort, ...filters },
		},
		abortController,
	);
	return result;
}
