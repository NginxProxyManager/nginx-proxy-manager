import * as api from "./base";
import type { Certificate } from "./models";

export interface UpdateCertificatePayload {
	meta?: {
		dnsProvider?: string;
		dnsProviderCredentials?: string;
		propagationSeconds?: number;
	};
}

export async function updateCertificate(
	id: number,
	payload: UpdateCertificatePayload,
): Promise<Certificate> {
	return await api.put({
		url: `/nginx/certificates/${id}`,
		data: payload,
	});
}
