import type { Table as ReactTable } from "@tanstack/react-table";
import { intl } from "src/locale";

/**
 * This component should never render as there should always be 1 user minimum,
 * but I'm keeping it for consistency.
 */

interface Props {
	tableInstance: ReactTable<any>;
}
export default function Empty({ tableInstance }: Props) {
	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<div className="text-center my-4">
					<h2>{intl.formatMessage({ id: "certificates.empty" })}</h2>
					<p className="text-muted">{intl.formatMessage({ id: "empty-subtitle" })}</p>
					<div className="dropdown">
						<button type="button" className="btn dropdown-toggle btn-pink my-3" data-bs-toggle="dropdown">
							{intl.formatMessage({ id: "certificates.add" })}
						</button>
						<div className="dropdown-menu">
							<a className="dropdown-item" href="#">
								{intl.formatMessage({ id: "lets-encrypt" })}
							</a>
							<a className="dropdown-item" href="#">
								{intl.formatMessage({ id: "certificates.custom" })}
							</a>
						</div>
					</div>
				</div>
			</td>
		</tr>
	);
}
