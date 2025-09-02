import { HasPermission } from "src/components";
import TableWrapper from "./TableWrapper";

const Streams = () => {
	return (
		<HasPermission permission="streams" type="view">
			<TableWrapper />
		</HasPermission>
	);
};

export default Streams;
