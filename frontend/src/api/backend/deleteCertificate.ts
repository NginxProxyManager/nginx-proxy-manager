import * as api from "./base";

export async function deleteCertificate(id: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/certificates/${id}`,
	});
}
