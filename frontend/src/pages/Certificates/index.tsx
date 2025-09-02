import { HasPermission } from "src/components";
import CertificateTable from "./CertificateTable";

const Certificates = () => {
	return (
		<HasPermission permission="certificates" type="view">
			<CertificateTable />
		</HasPermission>
	);
};

export default Certificates;
