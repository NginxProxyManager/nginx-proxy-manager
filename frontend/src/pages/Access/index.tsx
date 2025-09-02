import { HasPermission } from "src/components";
import TableWrapper from "./TableWrapper";

const Access = () => {
	return (
		<HasPermission permission="accessLists" type="view">
			<TableWrapper />
		</HasPermission>
	);
};

export default Access;
