import { useEffect, useReducer, useState } from "react";

import { Alert, AlertIcon } from "@chakra-ui/react";
import { SpinnerPage, tableEventReducer } from "components";
import { useCertificateAuthorities } from "hooks";

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

function TableWrapper() {
	const [{ offset, limit, sortBy, filters }, dispatch] = useReducer(
		tableEventReducer,
		initialState,
	);

	const [tableData, setTableData] = useState(null);
	const { isFetching, isLoading, isError, error, data } =
		useCertificateAuthorities(offset, limit, sortBy, filters);

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

	if (typeof data?.total === "undefined") {
		return (
			<Alert status="error">
				<AlertIcon />
				There was an error fetching the data.
			</Alert>
		);
	}

	const pagination = {
		offset: data?.offset,
		limit: data?.limit,
		total: data?.total,
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
