import * as api from "./base";
import type { Stream } from "./models";

export async function updateStream(item: Stream): Promise<Stream> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put({
		url: `/nginx/streams/${id}`,
		data: data,
	});
}
