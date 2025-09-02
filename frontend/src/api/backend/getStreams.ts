import * as api from "./base";
import type { Stream } from "./models";

export type StreamExpansion = "owner" | "certificate";

export async function getStreams(expand?: StreamExpansion[], params = {}): Promise<Stream[]> {
	return await api.get({
		url: "/nginx/streams",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
