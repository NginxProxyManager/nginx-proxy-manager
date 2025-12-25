import * as api from "./base";

export async function testHttpCertificate(domains: string[]): Promise<Array<{ domain: string; status: string }>> {
	return await api.post({
		url: "/nginx/certificates/test-http",
		data: {
			domains,
		},
	});
}
