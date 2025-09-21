import * as api from "./base";

export async function testHttpCertificate(domains: string[]): Promise<Record<string, string>> {
	return await api.get({
		url: "/nginx/certificates/test-http",
		params: {
			domains: domains.join(","),
		},
	});
}
