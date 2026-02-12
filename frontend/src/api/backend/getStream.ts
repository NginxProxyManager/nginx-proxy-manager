import * as api from "./base";
import type { StreamExpansion } from "./expansions";
import type { Stream } from "./models";

export async function getStream(id: number, expand?: StreamExpansion[], params = {}): Promise<Stream> {
	return await api.get({
		url: `/nginx/streams/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
