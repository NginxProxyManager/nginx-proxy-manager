import { IconAlertTriangle } from "@tabler/icons-react";
import { useFormikContext } from "formik";
import { useCertificates } from "src/hooks";
import { T } from "src/locale";
import { uncoveredDomains } from "src/modules/CertificateMatch";

/**
 * Non-blocking warning shown when the selected certificate does not cover
 * every typed domain name. Silent for "None" (0), "new" (no domains yet
 * to compare against) and while the certificate list is loading.
 */
export function CertificateMismatchWarning() {
	const { data: certificates } = useCertificates();
	const { values }: any = useFormikContext();
	const certificateId = values?.certificateId;
	if (!certificateId || certificateId === "new") {
		return null;
	}
	const cert = certificates?.find((c) => c.id === certificateId);
	const uncovered = uncoveredDomains(cert, values?.domainNames || []);
	if (!uncovered.length) {
		return null;
	}
	return (
		<p className="text-warning">
			<IconAlertTriangle size={16} className="me-1" />
			<T id="ssl-certificate-mismatch" data={{ domains: uncovered.join(", ") }} />
		</p>
	);
}
