import type { Table as ReactTable } from "@tanstack/react-table";
import { Button } from "src/components";
import { T } from "src/locale";

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
						<h2>
							<T id="empty.search" />
						</h2>
					) : (
						<>
							<h2>
								<T id="dead-hosts.empty" />
							</h2>
							<p className="text-muted">
								<T id="empty-subtitle" />
							</p>
							<Button className="btn-red my-3" onClick={onNew}>
								<T id="dead-hosts.add" />
							</Button>
						</>
					)}
				</div>
			</td>
		</tr>
	);
}
