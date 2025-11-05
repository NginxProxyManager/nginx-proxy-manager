import * as api from "./base";

export async function deleteStream(id: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/streams/${id}`,
	});
}
