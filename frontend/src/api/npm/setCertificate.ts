import * as api from "./base";
import { Certificate } from "./models";

export async function setCertificate(
	id: number,
	data: any,
): Promise<Certificate> {
	if (data.id) {
		delete data.id;
	}

	const { result } = await api.put({
		url: `/certificates/${id}`,
		data,
	});
	return result;
}
