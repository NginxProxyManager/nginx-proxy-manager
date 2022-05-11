import * as api from "./base";
import { CertificateAuthority } from "./models";

export async function setCertificateAuthority(
	id: number,
	data: any,
): Promise<CertificateAuthority> {
	if (data.id) {
		delete data.id;
	}

	const { result } = await api.put({
		url: `/certificate-authorities/${id}`,
		data,
	});
	return result;
}
