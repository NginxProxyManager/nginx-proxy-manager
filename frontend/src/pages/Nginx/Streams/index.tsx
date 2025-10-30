import { HasPermission } from "src/components";
import { STREAMS, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const Streams = () => {
	return (
		<HasPermission section={STREAMS} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default Streams;
