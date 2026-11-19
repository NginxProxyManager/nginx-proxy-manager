import { IconChevronDown, IconChevronRight, IconFolder } from "@tabler/icons-react";
import { flexRender, type Row, type RowData } from "@tanstack/react-table";
import { useState } from "react";
import type { TableLayoutProps } from "src/components";
import { intl } from "src/locale";
import { EmptyRow } from "./EmptyRow";
import type { Features } from "./features";

type FolderMode = "default" | "expandAll";

function TableBody<T extends RowData>(props: TableLayoutProps<T>) {
	const { tableInstance, extraStyles, emptyState, folders } = props;
	const rows = tableInstance.getRowModel().rows;
	// Open folders are remembered per mode, so that clearing a search
	// brings back the folders the user had opened before searching
	const [openFolders, setOpenFolders] = useState<Record<FolderMode, Record<string, boolean>>>({
		default: {},
		expandAll: {},
	});

	if (rows.length === 0) {
		return (
			<tbody className="table-tbody">
				{emptyState ? emptyState : <EmptyRow tableInstance={tableInstance} />}
			</tbody>
		);
	}

	const renderRow = (row: Row<Features, T>, className?: string) => (
		<tr key={row.id} className={className} {...extraStyles?.row(row.original)}>
			{row.getVisibleCells().map((cell: any) => {
				const { className } = (cell.column.columnDef.meta as any) ?? {};
				return (
					<td key={cell.id} className={className}>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</td>
				);
			})}
		</tr>
	);

	if (!folders) {
		return <tbody className="table-tbody">{rows.map((row) => renderRow(row))}</tbody>;
	}

	// Rows are already sorted by the table, grouping keeps that order within each folder
	const ungrouped: Row<Features, T>[] = [];
	const grouped = new Map<string, Row<Features, T>[]>();
	for (const row of rows) {
		const folder = folders.getFolder(row.original)?.trim();
		if (!folder) {
			ungrouped.push(row);
			continue;
		}
		const folderRows = grouped.get(folder);
		if (folderRows) {
			folderRows.push(row);
		} else {
			grouped.set(folder, [row]);
		}
	}

	const mode: FolderMode = folders.expandAll ? "expandAll" : "default";
	const isOpen = (folder: string) => openFolders[mode][folder] ?? mode === "expandAll";
	const toggle = (folder: string) =>
		setOpenFolders((state) => ({ ...state, [mode]: { ...state[mode], [folder]: !isOpen(folder) } }));
	const colSpan = tableInstance.getVisibleFlatColumns().length;

	// Each folder is its own row group, so it can be styled as one block
	return (
		<>
			{ungrouped.length ? <tbody className="table-tbody">{ungrouped.map((row) => renderRow(row))}</tbody> : null}
			{[...grouped.keys()]
				.sort((a, b) => a.localeCompare(b))
				.map((folder) => {
					const folderRows = grouped.get(folder) ?? [];
					const open = isOpen(folder);
					const enabledCount = folderRows.filter((row) => folders.isEnabled(row.original)).length;
					const disabledCount = folderRows.length - enabledCount;
					return (
						<tbody key={`folder:${folder}`} className="table-tbody table-folder-group">
							<tr className="table-folder">
								<td colSpan={colSpan}>
									<button
										type="button"
										className="table-folder-toggle"
										aria-expanded={open}
										onClick={() => toggle(folder)}
									>
										{open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
										<IconFolder size={16} className="text-secondary" />
										<strong className="text-truncate">{folder}</strong>
										<span
											className="status status-lime"
											title={intl.formatMessage({ id: "online" })}
										>
											<span className="status-dot" />
											{enabledCount}
										</span>
										{disabledCount > 0 ? (
											<span
												className="status status-red"
												title={intl.formatMessage({ id: "offline" })}
											>
												<span className="status-dot" />
												{disabledCount}
											</span>
										) : null}
									</button>
								</td>
							</tr>
							{open ? folderRows.map((row) => renderRow(row, "table-folder-item")) : null}
						</tbody>
					);
				})}
		</>
	);
}

export { TableBody };
