import * as api from "./base";
import { CertificatesResponse } from "./responseTypes";

export async function getCertificates(
	offset = 0,
	limit = 10,
	sort?: string,
	filters?: { [key: string]: string },
	abortController?: AbortController,
): Promise<CertificatesResponse> {
	const { result } = await api.get(
		{
			url: "certificates",
			params: { limit, offset, sort, expand: "user", ...filters },
		},
		abortController,
	);
	return result;
}
