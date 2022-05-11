import { useEffect, useReducer, useState } from "react";

import { Alert, AlertIcon, Heading, HStack } from "@chakra-ui/react";
import {
	EmptyList,
	PrettyButton,
	SpinnerPage,
	tableEventReducer,
} from "components";
import { useHosts } from "hooks";
import { intl } from "locale";

import { HostsTable } from "./HostsTable";

const initialState = {
	offset: 0,
	limit: 10,
	sortBy: [
		{
			id: "domain_names",
			desc: false,
		},
	],
	filters: [],
};

function Hosts() {
	const [{ offset, limit, sortBy, filters }, dispatch] = useReducer(
		tableEventReducer,
		initialState,
	);

	const [tableData, setTableData] = useState(null);
	const { isFetching, isLoading, error, data } = useHosts(
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

	// When there are no items and no filters active, show the nicer empty view
	if (data?.total === 0 && filters?.length === 0) {
		return (
			<EmptyList
				title={intl.formatMessage({ id: "create-host-title" })}
				summary={intl.formatMessage({ id: "create-hint" })}
				createButton={
					<PrettyButton mt={5}>
						{intl.formatMessage({ id: "lets-go" })}
					</PrettyButton>
				}
			/>
		);
	}

	const pagination = {
		offset: data?.offset || initialState.offset,
		limit: data?.limit || initialState.limit,
		total: data?.total || 0,
	};

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>{intl.formatMessage({ id: "hosts.title" })}</Heading>
				<PrettyButton size="sm">
					{intl.formatMessage({ id: "create-host" })}
				</PrettyButton>
			</HStack>
			<HostsTable
				data={data?.items || []}
				pagination={pagination}
				sortBy={sortBy}
				filters={filters}
				onTableEvent={dispatch}
			/>
		</>
	);
}

export default Hosts;
