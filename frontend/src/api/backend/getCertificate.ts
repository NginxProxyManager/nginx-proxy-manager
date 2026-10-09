import * as api from "./base";
import type { CertificateExpansion } from "./expansions";
import type { Certificate } from "./models";

export async function getCertificate(id: number, expand?: CertificateExpansion[], params = {}): Promise<Certificate> {
	return await api.get({
		url: `/nginx/certificates/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
