import { useState, useEffect, useMemo } from "react";

import {
	tableEvents,
	ActionsFormatter,
	CapabilitiesFormatter,
	DisabledFormatter,
	GravatarFormatter,
	TableFilter,
	TableLayout,
	TablePagination,
	TableSortBy,
	TextFilter,
} from "components";
import { useUser } from "hooks";
import { intl } from "locale";
import { SetPasswordModal, UserEditModal } from "modals";
import { FiEdit, FiLock } from "react-icons/fi";
import { useSortBy, useFilters, useTable, usePagination } from "react-table";

export interface TableProps {
	data: any;
	pagination: TablePagination;
	sortBy: TableSortBy[];
	filters: TableFilter[];
	onTableEvent: any;
}
function Table({
	data,
	pagination,
	onTableEvent,
	sortBy,
	filters,
}: TableProps) {
	const { data: me } = useUser("me");
	const [editId, setEditId] = useState(0);
	const [setPasswordUserId, setSetPasswordUserId] = useState(0);
	const [columns, tableData] = useMemo(() => {
		const columns = [
			{
				accessor: "gravatarUrl",
				className: "w-80",
				Cell: GravatarFormatter(),
			},
			{
				Header: intl.formatMessage({ id: "user.name" }),
				accessor: "name",
				sortable: true,
				Filter: TextFilter,
				Cell: DisabledFormatter(),
			},
			{
				Header: intl.formatMessage({ id: "user.email" }),
				accessor: "email",
				sortable: true,
				Filter: TextFilter,
			},
			{
				Header: intl.formatMessage({ id: "user.capabilities" }),
				accessor: "capabilities",
				Cell: CapabilitiesFormatter(),
			},
			{
				id: "actions",
				accessor: "id",
				className: "w-80",
				Cell: ActionsFormatter([
					{
						title: intl.formatMessage({ id: "action.edit" }),
						icon: <FiEdit />,
						onClick: (e: any, { id }: any) => setEditId(id),
						disabled: (data: any) => data.isSystem || data.id === me?.id,
					},
					{
						title: intl.formatMessage({ id: "action.set-password" }),
						icon: <FiLock />,
						onClick: (e: any, { id }: any) => setSetPasswordUserId(id),
						disabled: (data: any) => data.isSystem || data.id === me?.id,
					},
				]),
			},
		];
		return [columns, data];
	}, [data, me?.id]);

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

	const { gotoPage } = tableInstance;

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
				<UserEditModal userId={editId} isOpen onClose={() => setEditId(0)} />
			) : null}

			{setPasswordUserId ? (
				<SetPasswordModal
					userId={setPasswordUserId}
					isOpen
					onClose={() => setSetPasswordUserId(0)}
				/>
			) : null}
		</>
	);
}

export default Table;
