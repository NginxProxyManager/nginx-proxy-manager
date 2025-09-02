import * as api from "./base";

export async function deleteCertificate(id: number, abortController?: AbortController): Promise<boolean> {
	return await api.del(
		{
			url: `/nginx/certificates/${id}`,
		},
		abortController,
	);
}
