import * as api from "./base";
import { Certificate } from "./models";

export async function renewCertificate(
	id: number,
	abortController?: AbortController,
): Promise<Certificate> {
	const { result } = await api.post(
		{
			url: `/certificates/${id}/renew`,
		},
		abortController,
	);
	return result;
}
