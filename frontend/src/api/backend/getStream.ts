import * as api from "./base";
import type { Stream } from "./models";

export async function getStream(id: number, abortController?: AbortController): Promise<Stream> {
	return await api.get(
		{
			url: `/nginx/streams/${id}`,
		},
		abortController,
	);
}
