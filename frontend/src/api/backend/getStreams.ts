import * as api from "./base";
import type { HostExpansion } from "./expansions";
import type { Stream } from "./models";

export async function getStreams(expand?: HostExpansion[], params = {}): Promise<Stream[]> {
	return await api.get({
		url: "/nginx/streams",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
