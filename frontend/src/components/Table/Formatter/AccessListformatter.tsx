import type { AccessList } from "src/api/backend";
import { T } from "src/locale";
import { showAccessListModal } from "src/modals";

interface Props {
	access?: AccessList;
}
export function AccessListFormatter({ access }: Props) {
	if (!access) {
		return <T id="public" />;
	}
	return (
		<button
			type="button"
			className="btn btn-action btn-sm px-1"
			onClick={(e) => {
				e.preventDefault();
				showAccessListModal(access?.id || 0);
			}}
		>
			{access.name}
		</button>
	);
}
