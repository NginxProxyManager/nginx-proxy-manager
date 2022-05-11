import { useEffect, useReducer, useState } from "react";

import { Alert, AlertIcon, Heading, HStack } from "@chakra-ui/react";
import {
	EmptyList,
	PrettyButton,
	SpinnerPage,
	tableEventReducer,
} from "components";
import { useCertificates } from "hooks";
import { intl } from "locale";

import { CertificatesTable } from "./CertificatesTable";

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

function Certificates() {
	const [{ offset, limit, sortBy, filters }, dispatch] = useReducer(
		tableEventReducer,
		initialState,
	);

	const [tableData, setTableData] = useState(null);
	const { isFetching, isLoading, error, data } = useCertificates(
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

	if (data?.total === 0 && filters?.length === 0) {
		return (
			<EmptyList
				title={intl.formatMessage({ id: "create-certificate-title" })}
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
				<Heading mb={2}>
					{intl.formatMessage({ id: "certificates.title" })}
				</Heading>
				<PrettyButton size="sm">
					{intl.formatMessage({ id: "create-certificate" })}
				</PrettyButton>
			</HStack>
			<CertificatesTable
				data={data?.items || []}
				pagination={pagination}
				sortBy={sortBy}
				filters={filters}
				onTableEvent={dispatch}
			/>
		</>
	);
}

export default Certificates;
