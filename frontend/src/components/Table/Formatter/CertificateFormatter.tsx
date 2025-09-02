import type { Certificate } from "src/api/backend";
import { intl } from "src/locale";

interface Props {
	certificate?: Certificate;
}
export function CertificateFormatter({ certificate }: Props) {
	if (certificate) {
		return intl.formatMessage({ id: "lets-encrypt" });
	}

	return intl.formatMessage({ id: "http-only" });
}
