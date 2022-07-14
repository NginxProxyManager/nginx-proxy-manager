import { useEffect, useMemo } from "react";

import {
	tableEvents,
	ActionsFormatter,
	HostTypeFormatter,
	IDFormatter,
	TableFilter,
	TableLayout,
	TablePagination,
	TableSortBy,
	TextFilter,
} from "components";
import { intl } from "locale";
import { FiEdit } from "react-icons/fi";
import { useSortBy, useFilters, useTable, usePagination } from "react-table";

const rowActions = [
	{
		title: intl.formatMessage({ id: "action.edit" }),
		onClick: (e: any, data: any) => {
			alert(JSON.stringify(data, null, 2));
		},
		icon: <FiEdit />,
		show: (data: any) => !data.isSystem,
	},
];

export interface HostTemplatesTableProps {
	data: any;
	pagination: TablePagination;
	sortBy: TableSortBy[];
	filters: TableFilter[];
	onTableEvent: any;
}
function HostTemplatesTable({
	data,
	pagination,
	onTableEvent,
	sortBy,
	filters,
}: HostTemplatesTableProps) {
	const [columns, tableData] = useMemo(() => {
		const columns: any[] = [
			{
				Header: intl.formatMessage({ id: "column.id" }),
				accessor: "id",
				Cell: IDFormatter(),
				className: "w-80",
				sortable: true,
			},
			{
				Header: intl.formatMessage({ id: "column.name" }),
				accessor: "name",
				sortable: true,
				Filter: TextFilter,
			},
			{
				Header: intl.formatMessage({ id: "column.host-type" }),
				accessor: "hostType",
				Cell: HostTypeFormatter(),
				sortable: true,
				Filter: TextFilter,
			},
			{
				id: "actions",
				accessor: "id",
				Cell: ActionsFormatter(rowActions),
				className: "w-80",
			},
		];
		return [columns, data];
	}, [data]);

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

	return <TableLayout pagination={pagination} {...tableInstance} />;
}

export { HostTemplatesTable };
