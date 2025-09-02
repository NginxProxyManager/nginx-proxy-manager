import * as api from "./base";
import type { Binary } from "./responseTypes";

export async function downloadCertificate(id: number, abortController?: AbortController): Promise<Binary> {
	return await api.get(
		{
			url: `/nginx/certificates/${id}/download`,
		},
		abortController,
	);
}
