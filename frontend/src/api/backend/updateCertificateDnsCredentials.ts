import * as api from "./base";
import type { Certificate } from "./models";

export interface CertificateCredentialRef {
	type: "internal" | "external";
	id?: number;
	providerId?: number;
	path?: string;
	field?: string;
}

/**
 * Replaces a DNS challenge certificate's credentials: send exactly one of credentialRef or
 * dnsProviderCredentials. Takes effect at the next renewal.
 */
export async function updateCertificateDnsCredentials(
	id: number,
	data: { credentialRef: CertificateCredentialRef } | { dnsProviderCredentials: string },
): Promise<Certificate> {
	return await api.put({ url: `/nginx/certificates/${id}/dns-credentials`, data });
}
