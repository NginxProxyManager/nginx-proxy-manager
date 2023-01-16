import { useEffect, useReducer, useState } from "react";

import { Alert, AlertIcon } from "@chakra-ui/react";
import { EmptyList, SpinnerPage, tableEventReducer } from "components";
import { useUpstreams } from "hooks";
import { intl } from "locale";

import Table from "./Table";

const initialState = {
	offset: 0,
	limit: 10,
	sortBy: [
		{
			id: "name",
			desc: false,
		},
	],
	filters: [],
};

interface TableWrapperProps {
	onCreateClick: () => void;
}
function TableWrapper({ onCreateClick }: TableWrapperProps) {
	const [{ offset, limit, sortBy, filters }, dispatch] = useReducer(
		tableEventReducer,
		initialState,
	);

	const [tableData, setTableData] = useState(null);
	const { isFetching, isLoading, isError, error, data } = useUpstreams(
		offset,
		limit,
		sortBy,
		filters,
	);

	useEffect(() => {
		setTableData(data as any);
	}, [data]);

	if (isFetching || isLoading || !tableData) {
		return <SpinnerPage />;
	}

	if (isError) {
		return (
			<Alert status="error">
				<AlertIcon />
				{error?.message || "Unknown error"}
			</Alert>
		);
	}

	if (isFetching || isLoading || !tableData) {
		return <SpinnerPage />;
	}

	// When there are no items and no filters active, show the nicer empty view
	if (data?.total === 0 && filters?.length === 0) {
		return (
			<EmptyList
				title={intl.formatMessage({ id: "create-upstream-title" })}
				summary={intl.formatMessage({ id: "create-hint" })}
			/>
		);
	}

	const pagination = {
		offset: data?.offset || initialState.offset,
		limit: data?.limit || initialState.limit,
		total: data?.total || 0,
	};

	return (
		<Table
			data={data?.items || []}
			pagination={pagination}
			sortBy={sortBy}
			filters={filters}
			onTableEvent={dispatch}
		/>
	);
}

export default TableWrapper;
