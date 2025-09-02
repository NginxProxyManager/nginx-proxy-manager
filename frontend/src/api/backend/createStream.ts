import * as api from "./base";
import type { Stream } from "./models";

export async function createStream(item: Stream, abortController?: AbortController): Promise<Stream> {
	return await api.post(
		{
			url: "/nginx/streams",
			// todo: only use whitelist of fields for this data
			data: item,
		},
		abortController,
	);
}
