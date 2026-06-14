import * as api from "./base";
import type { Certificate } from "./models";

export async function renewCertificate(id: number): Promise<Certificate> {
	return await api.post({
		url: `/nginx/certificates/${id}/renew`,
	});
}
