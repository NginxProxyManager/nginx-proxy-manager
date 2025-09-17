import * as api from "./base";
import type { Certificate } from "./models";

export type CertificateExpansion = "owner" | "proxy_hosts" | "redirection_hosts" | "dead_hosts";

export async function getCertificates(expand?: CertificateExpansion[], params = {}): Promise<Certificate[]> {
	return await api.get({
		url: "/nginx/certificates",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
