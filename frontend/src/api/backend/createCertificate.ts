import * as api from "./base";
import type { Certificate } from "./models";

export async function createCertificate(item: Certificate): Promise<Certificate> {
	return await api.post({
		url: "/nginx/certificates",
		// todo: only use whitelist of fields for this data
		data: item,
	});
}
