import { HasPermission } from "src/components";
import TableWrapper from "./TableWrapper";

const Users = () => {
	return (
		<HasPermission permission="admin" type="manage">
			<TableWrapper />
		</HasPermission>
	);
};

export default Users;
