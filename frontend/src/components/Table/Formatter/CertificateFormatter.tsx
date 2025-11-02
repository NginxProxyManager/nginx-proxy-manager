import type { Certificate } from "src/api/backend";
import { T } from "src/locale";

interface Props {
	certificate?: Certificate;
}
export function CertificateFormatter({ certificate }: Props) {
	return <T id={certificate ? "lets-encrypt" : "http-only"} />;
}
