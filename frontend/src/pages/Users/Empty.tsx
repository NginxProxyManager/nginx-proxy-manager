import type { Table as ReactTable } from "@tanstack/react-table";
import { Button } from "src/components";
import { intl } from "src/locale";

interface Props {
	tableInstance: ReactTable<any>;
	onNewUser?: () => void;
}
export default function Empty({ tableInstance, onNewUser }: Props) {
	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<div className="text-center my-4">
					<h2>{intl.formatMessage({ id: "proxy-hosts.empty" })}</h2>
					<p className="text-muted">{intl.formatMessage({ id: "empty-subtitle" })}</p>
					<Button className="btn-lime my-3" onClick={onNewUser}>
						{intl.formatMessage({ id: "proxy-hosts.add" })}
					</Button>
				</div>
			</td>
		</tr>
	);
}
