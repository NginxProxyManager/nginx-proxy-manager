import * as api from "./base";
import { Certificate } from "./models";

export async function createCertificate(
	data: Certificate,
	abortController?: AbortController,
): Promise<Certificate> {
	const { result } = await api.post(
		{
			url: "/certificates",
			data,
		},
		abortController,
	);
	return result;
}
