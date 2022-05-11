import * as api from "./base";
import { CertificateAuthority } from "./models";

export async function getCertificateAuthority(
	id: number,
	params = {},
): Promise<CertificateAuthority> {
	const { result } = await api.get({
		url: `/certificate-authorities/${id}`,
		params,
	});
	return result;
}
