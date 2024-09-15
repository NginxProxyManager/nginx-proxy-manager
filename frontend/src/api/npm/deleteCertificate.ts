import * as api from "./base";

export async function deleteCertificate(
	id: number,
	abortController?: AbortController,
): Promise<boolean> {
	const { result } = await api.del(
		{
			url: `/certificates/${id}`,
		},
		abortController,
	);
	return result;
}
