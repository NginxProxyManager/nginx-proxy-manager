import * as api from "./base";
import type { Certificate } from "./models";

export async function updateCertificate(id: number, certificate: Certificate): Promise<Certificate> {
	return await api.put({
		url: `/nginx/certificates/${id}`,
		data: certificate,
	});
}
