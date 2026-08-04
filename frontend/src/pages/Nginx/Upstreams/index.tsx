import { HasPermission } from "src/components";
import { UPSTREAMS, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

export default function Upstreams() {
	return <HasPermission section={UPSTREAMS} permission={VIEW} pageLoading loadingNoLogo><TableWrapper /></HasPermission>;
}
