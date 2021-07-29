import * as api from "./base";
import { CertificateAuthoritiesResponse } from "./responseTypes";

export async function requestCertificateAuthorities(
	offset?: number,
	abortController?: AbortController,
): Promise<CertificateAuthoritiesResponse> {
	const { result } = await api.get(
		{
			url: "certificate-authorities",
			params: { limit: 20, offset: offset || 0 },
		},
		abortController,
	);
	return result;
}
