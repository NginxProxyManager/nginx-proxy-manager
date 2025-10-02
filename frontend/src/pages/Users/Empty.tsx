import type { Table as ReactTable } from "@tanstack/react-table";
import { Button } from "src/components";
import { T } from "src/locale";

interface Props {
	tableInstance: ReactTable<any>;
	onNewUser?: () => void;
	isFiltered?: boolean;
}
export default function Empty({ tableInstance, onNewUser, isFiltered }: Props) {
	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<div className="text-center my-4">
					{isFiltered ? (
						<h2>
							<T id="empty-search" />
						</h2>
					) : (
						<>
							<h2>
								<T id="users.empty" />
							</h2>
							<p className="text-muted">
								<T id="empty-subtitle" />
							</p>
							<Button className="btn-orange my-3" onClick={onNewUser}>
								<T id="users.add" />
							</Button>
						</>
					)}
				</div>
			</td>
		</tr>
	);
}
