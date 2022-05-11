import * as api from "./base";
import { CertificateAuthority } from "./models";

export async function createCertificateAuthority(
	data: CertificateAuthority,
	abortController?: AbortController,
): Promise<CertificateAuthority> {
	const { result } = await api.post(
		{
			url: "/certificate-authorities",
			data,
		},
		abortController,
	);
	return result;
}
