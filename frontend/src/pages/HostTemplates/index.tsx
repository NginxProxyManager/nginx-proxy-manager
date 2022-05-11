import { useEffect, useReducer, useState } from "react";

import { Alert, AlertIcon, Heading, HStack } from "@chakra-ui/react";
import { PrettyButton, SpinnerPage, tableEventReducer } from "components";
import { useHostTemplates } from "hooks";
import { intl } from "locale";

import { HostTemplatesTable } from "./HostTemplatesTable";

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

function HostTemplates() {
	const [{ offset, limit, sortBy, filters }, dispatch] = useReducer(
		tableEventReducer,
		initialState,
	);

	const [tableData, setTableData] = useState(null);
	const { isFetching, isLoading, error, data } = useHostTemplates(
		offset,
		limit,
		sortBy,
		filters,
	);

	useEffect(() => {
		setTableData(data as any);
	}, [data]);

	if (error || (!tableData && !isFetching && !isLoading)) {
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

	const pagination = {
		offset: data?.offset || initialState.offset,
		limit: data?.limit || initialState.limit,
		total: data?.total || 0,
	};

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>
					{intl.formatMessage({ id: "host-templates.title" })}
				</Heading>
				<PrettyButton size="sm">
					{intl.formatMessage({ id: "create-host-template" })}
				</PrettyButton>
			</HStack>
			<HostTemplatesTable
				data={data?.items || []}
				pagination={pagination}
				sortBy={sortBy}
				filters={filters}
				onTableEvent={dispatch}
			/>
		</>
	);
}

export default HostTemplates;
