import * as api from "./base";
import type { ValidatedCertificateResponse } from "./responseTypes";

export async function validateCertificate(
	certificate: string,
	certificateKey: string,
	intermediateCertificate?: string,
): Promise<ValidatedCertificateResponse> {
	return await api.post({
		url: "/nginx/certificates/validate",
		data: { certificate, certificateKey, intermediateCertificate },
	});
}
