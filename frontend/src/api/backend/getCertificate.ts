import * as api from "./base";
import type { Certificate } from "./models";

export async function getCertificate(id: number, abortController?: AbortController): Promise<Certificate> {
	return await api.get(
		{
			url: `/nginx/certificates/${id}`,
		},
		abortController,
	);
}
