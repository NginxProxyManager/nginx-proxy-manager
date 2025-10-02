import type { Table as ReactTable } from "@tanstack/react-table";
import { T } from "src/locale";

interface Props {
	tableInstance: ReactTable<any>;
	onNew?: () => void;
	onNewCustom?: () => void;
	isFiltered?: boolean;
}
export default function Empty({ tableInstance, onNew, onNewCustom, isFiltered }: Props) {
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
								<T id="certificates.empty" />
							</h2>
							<p className="text-muted">
								<T id="empty-subtitle" />
							</p>
							<div className="dropdown">
								<button
									type="button"
									className="btn dropdown-toggle btn-pink my-3"
									data-bs-toggle="dropdown"
								>
									<T id="certificates.add" />
								</button>
								<div className="dropdown-menu">
									<a
										className="dropdown-item"
										href="#"
										onClick={(e) => {
											e.preventDefault();
											onNew?.();
										}}
									>
										<T id="lets-encrypt" />
									</a>
									<a
										className="dropdown-item"
										href="#"
										onClick={(e) => {
											e.preventDefault();
											onNewCustom?.();
										}}
									>
										<T id="certificates.custom" />
									</a>
								</div>
							</div>
						</>
					)}
				</div>
			</td>
		</tr>
	);
}
