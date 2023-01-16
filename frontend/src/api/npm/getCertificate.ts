import * as api from "./base";
import { Certificate } from "./models";

export async function getCertificate(
	id: number,
	params = {},
): Promise<Certificate> {
	const { result } = await api.get({
		url: `/certificates/${id}`,
		params,
	});
	return result;
}
