import { useEffect, useReducer, useState } from "react";

import { Alert, AlertIcon, Heading, HStack } from "@chakra-ui/react";
import {
	HelpDrawer,
	PrettyButton,
	SpinnerPage,
	tableEventReducer,
} from "components";
import { useNginxTemplates } from "hooks";
import { intl } from "locale";

import { NginxTemplatesTable } from "./NginxTemplatesTable";

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

function NginxTemplates() {
	const [{ offset, limit, sortBy, filters }, dispatch] = useReducer(
		tableEventReducer,
		initialState,
	);

	const [tableData, setTableData] = useState(null);
	const { isFetching, isLoading, error, data } = useNginxTemplates(
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
					{intl.formatMessage({ id: "nginx-templates.title" })}
				</Heading>
				<HStack>
					<HelpDrawer section="NginxTemplates" />
					<PrettyButton size="sm">
						{intl.formatMessage({ id: "create-nginx-template" })}
					</PrettyButton>
				</HStack>
			</HStack>
			<NginxTemplatesTable
				data={data?.items || []}
				pagination={pagination}
				sortBy={sortBy}
				filters={filters}
				onTableEvent={dispatch}
			/>
		</>
	);
}

export default NginxTemplates;
