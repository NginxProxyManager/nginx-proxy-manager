import * as api from "./base";
import { CertificateAuthoritiesResponse } from "./responseTypes";

export async function getCertificateAuthorities(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<CertificateAuthoritiesResponse> {
	const { result } = await api.get(
		{
			url: "certificate-authorities",
			params: { limit, offset, sort, ...filters },
		},
		abortController,
	);
	return result;
}
