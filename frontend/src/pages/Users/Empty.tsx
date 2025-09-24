import type { Table as ReactTable } from "@tanstack/react-table";
import { Button } from "src/components";
import { intl } from "src/locale";

interface Props {
	tableInstance: ReactTable<any>;
	onNewUser?: () => void;
	isFiltered?: boolean;
}
export default function Empty({ tableInstance, onNewUser, isFiltered }: Props) {
	if (isFiltered) {
	}

	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<div className="text-center my-4">
					{isFiltered ? (
						<h2>{intl.formatMessage({ id: "empty-search" })}</h2>
					) : (
						<>
							<h2>{intl.formatMessage({ id: "users.empty" })}</h2>
							<p className="text-muted">{intl.formatMessage({ id: "empty-subtitle" })}</p>
							<Button className="btn-orange my-3" onClick={onNewUser}>
								{intl.formatMessage({ id: "users.add" })}
							</Button>
						</>
					)}
				</div>
			</td>
		</tr>
	);
}
