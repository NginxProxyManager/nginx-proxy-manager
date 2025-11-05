import type { Certificate } from "src/api/backend";
import { T } from "src/locale";

interface Props {
	certificate?: Certificate;
}
export function CertificateFormatter({ certificate }: Props) {
	let translation = "http-only";
	if (certificate) {
		translation = certificate.provider;
		if (translation === "letsencrypt") {
			translation = "lets-encrypt";
		} else if (translation === "other") {
			translation = "certificates.custom";
		}
	}
	return <T id={translation} />;
}
