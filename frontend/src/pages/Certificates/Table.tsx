import { useEffect, useMemo, useState } from "react";

import {
	tableEvents,
	ActionsFormatter,
	CertificateStatusFormatter,
	CertificateTypeFormatter,
	GravatarFormatter,
	IDFormatter,
	MonospaceFormatter,
	TableFilter,
	TableLayout,
	TablePagination,
	TableSortBy,
	TextFilter,
} from "components";
import { intl } from "locale";
import { CertificateEditModal } from "modals";
import { FiDownload, FiEdit, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { useSortBy, useFilters, useTable, usePagination } from "react-table";

export interface TableProps {
	data: any;
	pagination: TablePagination;
	sortBy: TableSortBy[];
	filters: TableFilter[];
	onTableEvent: any;
	onRenewal: (id: number) => void;
}
function Table({
	data,
	pagination,
	onTableEvent,
	sortBy,
	filters,
	onRenewal,
}: TableProps) {
	const [editId, setEditId] = useState(0);
	const [columns, tableData] = useMemo(() => {
		const columns = [
			{
				accessor: "user.gravatarUrl",
				Cell: GravatarFormatter(),
				className: "w-80",
			},
			{
				Header: intl.formatMessage({ id: "column.id" }),
				accessor: "id",
				Cell: IDFormatter(),
				className: "w-80",
				sortable: true,
			},
			{
				Header: intl.formatMessage({ id: "name" }),
				accessor: "name",
				sortable: true,
				Filter: TextFilter,
				Cell: MonospaceFormatter(),
			},
			{
				Header: intl.formatMessage({ id: "column.validation-type" }),
				accessor: "type",
				sortable: true,
				Cell: CertificateTypeFormatter(),
			},
			{
				Header: intl.formatMessage({ id: "column.status" }),
				accessor: "status",
				sortable: true,
				Cell: CertificateStatusFormatter(),
			},
			{
				id: "actions",
				accessor: "id",
				className: "w-80",
				Cell: ActionsFormatter([
					{
						title: intl.formatMessage({
							id: "action.edit",
						}),
						onClick: (e: any, { id }: any) => alert(id),
						icon: <FiEdit />,
						disabled: (data: any) =>
							data.type === "dns" || data.type === "http",
					},
					{
						title: intl.formatMessage({
							id: "action.renew",
						}),
						onClick: (e: any, { id }: any) => onRenewal(id),
						icon: <FiRefreshCw />,
						disabled: (data: any) =>
							data.type !== "dns" && data.type !== "http",
					},
					{
						title: intl.formatMessage({
							id: "action.download",
						}),
						onClick: (e: any, { id }: any) => alert(id),
						icon: <FiDownload />,
						disabled: (data: any) => data.isReadonly,
					},
					{
						title: intl.formatMessage({
							id: "action.delete",
						}),
						onClick: (e: any, { id }: any) => alert(id),
						icon: <FiTrash2 />,
						disabled: (data: any) => data.isReadonly,
					},
				]),
			},
		];
		return [columns, data];
	}, [data, onRenewal]);

	const tableInstance = useTable(
		{
			columns,
			data: tableData,
			initialState: {
				pageIndex: Math.floor(pagination.offset / pagination.limit),
				pageSize: pagination.limit,
				sortBy,
				filters,
			},
			// Tell the usePagination
			// hook that we'll handle our own data fetching
			// This means we'll also have to provide our own
			// pageCount.
			pageCount: Math.ceil(pagination.total / pagination.limit),
			manualPagination: true,
			// Sorting options
			manualSortBy: true,
			disableMultiSort: true,
			disableSortRemove: true,
			autoResetSortBy: false,
			// Filter options
			manualFilters: true,
			autoResetFilters: false,
		},
		useFilters,
		useSortBy,
		usePagination,
	);

	const gotoPage = tableInstance.gotoPage;

	useEffect(() => {
		onTableEvent({
			type: tableEvents.PAGE_CHANGED,
			payload: tableInstance.state.pageIndex,
		});
	}, [onTableEvent, tableInstance.state.pageIndex]);

	useEffect(() => {
		onTableEvent({
			type: tableEvents.PAGE_SIZE_CHANGED,
			payload: tableInstance.state.pageSize,
		});
		gotoPage(0);
	}, [gotoPage, onTableEvent, tableInstance.state.pageSize]);

	useEffect(() => {
		if (pagination.total) {
			onTableEvent({
				type: tableEvents.TOTAL_COUNT_CHANGED,
				payload: pagination.total,
			});
		}
	}, [pagination.total, onTableEvent]);

	useEffect(() => {
		onTableEvent({
			type: tableEvents.SORT_CHANGED,
			payload: tableInstance.state.sortBy,
		});
	}, [onTableEvent, tableInstance.state.sortBy]);

	useEffect(() => {
		onTableEvent({
			type: tableEvents.FILTERS_CHANGED,
			payload: tableInstance.state.filters,
		});
	}, [onTableEvent, tableInstance.state.filters]);

	return (
		<>
			<TableLayout pagination={pagination} {...tableInstance} />
			{editId ? (
				<CertificateEditModal
					isOpen
					editId={editId}
					onClose={() => setEditId(0)}
				/>
			) : null}
		</>
	);
}

export default Table;
