import * as api from "./base";
import type { UploadedCertificateResponse } from "./responseTypes";

export async function uploadCertificate(id: number, data: FormData): Promise<UploadedCertificateResponse> {
	return await api.post({
		url: `/nginx/certificates/${id}/upload`,
		data,
	});
}
