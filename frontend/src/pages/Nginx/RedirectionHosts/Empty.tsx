import type { Table as ReactTable } from "@tanstack/react-table";
import { Button } from "src/components";
import { intl } from "src/locale";

interface Props {
	tableInstance: ReactTable<any>;
}
export default function Empty({ tableInstance }: Props) {
	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<div className="text-center my-4">
					<h2>{intl.formatMessage({ id: "redirection-hosts.empty" })}</h2>
					<p className="text-muted">{intl.formatMessage({ id: "empty-subtitle" })}</p>
					<Button className="btn-yellow my-3">{intl.formatMessage({ id: "redirection-hosts.add" })}</Button>
				</div>
			</td>
		</tr>
	);
}
