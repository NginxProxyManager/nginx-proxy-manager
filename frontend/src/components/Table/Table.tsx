import React, { ReactNode } from "react";

import cn from "classnames";
import { Badge } from "components";
import { TableActionsMenu } from "components";

export interface TableColumn {
	/**
	 * Column Name, should match the dataset keys
	 */
	name: string;
	/**
	 * Column Title
	 */
	title: string;
	/**
	 * Function to perform when rendering this field
	 */
	formatter?: any;
	/**
	 * Additional classes
	 */
	className?: string;
}

export interface TablePagination {
	limit: number;
	offset: number;
	total: number;
	onSetOffset?: any;
}

export interface TableProps {
	/**
	 * Columns
	 */
	columns: TableColumn[];
	/**
	 * data to render
	 */
	data: any;
	/**
	 * Pagination
	 */
	pagination?: TablePagination;
	/**
	 * Name of column to show sorted by
	 */
	sortBy?: string;
	/**
	 * Should we render actions column at the end
	 */
	hasActions?: boolean;
}
export const Table = ({
	columns,
	data,
	pagination,
	sortBy,
	hasActions,
}: TableProps) => {
	const getFormatter = (given: any) => {
		if (typeof given === "function") {
			return given;
		}

		if (typeof given === "string") {
			switch (given) {
				// Simple ID column has text-muted
				case "id":
					return (val: number) => {
						return <span className="text-muted">{val}</span>;
					};
				/*
				case "setup":
					return (val: boolean) => {
						return (
							<Badge color={val ? "lime" : "yellow"}>
								{val
									? intl.formatMessage({
											id: "ready",
											defaultMessage: "Ready",
									  })
									: intl.formatMessage({
											id: "setup-required",
											defaultMessage: "Setup Required",
									  })}
							</Badge>
						);
					};
				*/
				case "bool":
					return (val: boolean) => {
						return (
							<Badge color={val ? "lime" : "orange"}>
								{val ? "true" : "false"}
							</Badge>
						);
					};

				default:
					return () => {
						return <>formatter-not-found: {given}</>;
					};
			}
		}
	};

	const getPagination = (p: TablePagination) => {
		const totalPages = Math.ceil(p.total / p.limit);
		const currentPage = Math.floor(p.offset / p.limit) + 1;
		const end = p.total < p.limit ? p.total : p.offset + p.limit;

		const getPageList = () => {
			const list = [];
			for (let x = 0; x < totalPages; x++) {
				list.push(
					<li
						key={`table-pagination-${x}`}
						className={cn("page-item", { active: currentPage === x + 1 })}>
						<button
							className="page-link"
							onClick={
								p.onSetOffset
									? () => {
											p.onSetOffset(x * p.limit);
									  }
									: undefined
							}>
							{x + 1}
						</button>
					</li>,
				);
			}
			return list;
		};

		return (
			<div className="card-footer d-flex align-items-center">
				<p className="m-0 text-muted">
					Showing <span>{p.offset + 1}</span> to <span>{end}</span> of{" "}
					<span>{p.total}</span> item{p.total === 1 ? "" : "s"}
				</p>
				{end >= p.total ? (
					<ul className="pagination m-0 ms-auto">
						<li className={cn("page-item", { disabled: currentPage <= 1 })}>
							<button
								className="page-link"
								tabIndex={-1}
								aria-disabled={currentPage <= 1}
								onClick={
									p.onSetOffset
										? () => {
												p.onSetOffset(p.offset - p.limit);
										  }
										: undefined
								}>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									className="icon"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									strokeWidth="2"
									stroke="currentColor"
									fill="none"
									strokeLinecap="round"
									strokeLinejoin="round">
									<path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
									<polyline points="15 6 9 12 15 18"></polyline>
								</svg>
								prev
							</button>
						</li>
						{getPageList()}
						<li
							className={cn("page-item", {
								disabled: currentPage >= totalPages,
							})}>
							<button
								className="page-link"
								aria-disabled={currentPage >= totalPages}
								onClick={
									p.onSetOffset
										? () => {
												p.onSetOffset(p.offset + p.limit);
										  }
										: undefined
								}>
								next
								<svg
									xmlns="http://www.w3.org/2000/svg"
									className="icon"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									strokeWidth="2"
									stroke="currentColor"
									fill="none"
									strokeLinecap="round"
									strokeLinejoin="round">
									<path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
									<polyline points="9 6 15 12 9 18"></polyline>
								</svg>
							</button>
						</li>
					</ul>
				) : null}
			</div>
		);
	};

	return (
		<>
			<div className="table-responsive">
				<table className="table card-table table-vcenter text-nowrap datatable">
					<thead>
						<tr>
							{columns.map((col, idx) => {
								return (
									<th key={`table-col-${idx}`} className={col.className}>
										{col.title}
										{sortBy === col.name ? (
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className="icon icon-sm text-dark icon-thick"
												width="24"
												height="24"
												viewBox="0 0 24 24"
												strokeWidth="2"
												stroke="currentColor"
												fill="none"
												strokeLinecap="round"
												strokeLinejoin="round">
												<path
													stroke="none"
													d="M0 0h24v24H0z"
													fill="none"></path>
												<polyline points="6 15 12 9 18 15"></polyline>
											</svg>
										) : null}
									</th>
								);
							})}
							{hasActions && <th />}
						</tr>
					</thead>
					<tbody>
						{data.map((row: any, idx: number) => {
							return (
								<tr key={`table-row-${idx}`}>
									{columns.map((col, idx2) => {
										return (
											<td
												key={`table-col-${idx}-${idx2}`}
												className={col.className}>
												{col.formatter
													? getFormatter(col.formatter)(row[col.name], row)
													: row[col.name]}
											</td>
										);
									})}
									{hasActions && (
										<td>
											<TableActionsMenu actions={data.actions} />
										</td>
									)}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{pagination ? getPagination(pagination) : null}
		</>
	);
};
