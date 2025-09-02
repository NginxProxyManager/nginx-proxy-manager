import * as api from "./base";
import type { Certificate } from "./models";

export async function uploadCertificate(
	id: number,
	certificate: string,
	certificateKey: string,
	intermediateCertificate?: string,
	abortController?: AbortController,
): Promise<Certificate> {
	return await api.post(
		{
			url: `/nginx/certificates/${id}/upload`,
			data: { certificate, certificateKey, intermediateCertificate },
		},
		abortController,
	);
}
