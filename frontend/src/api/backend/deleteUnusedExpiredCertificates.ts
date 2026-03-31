import * as api from "./base";
import type { DeleteUnusedExpiredCertificatesResponse } from "./responseTypes";

export async function deleteUnusedExpiredCertificates(): Promise<DeleteUnusedExpiredCertificatesResponse> {
	return await api.del({
		url: "/nginx/certificates/unused-expired",
	});
}
