import type { Table as ReactTable } from "@tanstack/react-table";
import { Button } from "src/components";
import { intl } from "src/locale";

interface Props {
	tableInstance: ReactTable<any>;
	onNew?: () => void;
	isFiltered?: boolean;
}
export default function Empty({ tableInstance, onNew, isFiltered }: Props) {
	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<div className="text-center my-4">
					{isFiltered ? (
						<h2>{intl.formatMessage({ id: "empty-search" })}</h2>
					) : (
						<>
							<h2>{intl.formatMessage({ id: "streams.empty" })}</h2>
							<p className="text-muted">{intl.formatMessage({ id: "empty-subtitle" })}</p>
							<Button className="btn-blue my-3" onClick={onNew}>
								{intl.formatMessage({ id: "streams.add" })}
							</Button>
						</>
					)}
				</div>
			</td>
		</tr>
	);
}
