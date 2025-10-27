import * as api from "./base";
import type { ValidatedCertificateResponse } from "./responseTypes";

export async function validateCertificate(data: FormData): Promise<ValidatedCertificateResponse> {
	return await api.post({
		url: "/nginx/certificates/validate",
		data,
	});
}
