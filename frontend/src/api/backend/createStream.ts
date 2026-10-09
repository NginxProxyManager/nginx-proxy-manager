import * as api from "./base";
import type { Stream } from "./models";

export async function createStream(item: Stream): Promise<Stream> {
	return await api.post({
		url: "/nginx/streams",
		data: item,
	});
}
