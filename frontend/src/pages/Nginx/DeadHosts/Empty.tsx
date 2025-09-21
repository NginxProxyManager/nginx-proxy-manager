import type { Table as ReactTable } from "@tanstack/react-table";
import { Button } from "src/components";
import { intl } from "src/locale";

interface Props {
	tableInstance: ReactTable<any>;
	onNew?: () => void;
}
export default function Empty({ tableInstance, onNew }: Props) {
	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<div className="text-center my-4">
					<h2>{intl.formatMessage({ id: "dead-hosts.empty" })}</h2>
					<p className="text-muted">{intl.formatMessage({ id: "empty-subtitle" })}</p>
					<Button className="btn-red my-3" onClick={onNew}>
						{intl.formatMessage({ id: "dead-hosts.add" })}
					</Button>
				</div>
			</td>
		</tr>
	);
}
