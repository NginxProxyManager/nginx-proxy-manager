import * as api from "./base";
import { CertificatesResponse } from "./responseTypes";

export async function requestCertificates(
	offset?: number,
	abortController?: AbortController,
): Promise<CertificatesResponse> {
	const { result } = await api.get(
		{
			url: "certificates",
			params: { limit: 20, offset: offset || 0 },
		},
		abortController,
	);
	return result;
}
