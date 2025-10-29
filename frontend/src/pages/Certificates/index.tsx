import { HasPermission } from "src/components";
import TableWrapper from "./TableWrapper";

const Certificates = () => {
	return (
		<HasPermission permission="certificates" type="view" pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default Certificates;
