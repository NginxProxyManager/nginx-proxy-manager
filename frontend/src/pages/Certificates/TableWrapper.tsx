import { useEffect, useReducer, useState } from "react";

import { Alert, AlertIcon, useToast } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";

import { renewCertificate } from "src/api/npm";
import { EmptyList, SpinnerPage, tableEventReducer } from "src/components";
import { useCertificates } from "src/hooks";
import { intl } from "src/locale";

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
	const toast = useToast();
	const queryClient = useQueryClient();

	const [{ offset, limit, sortBy, filters }, dispatch] = useReducer(
		tableEventReducer,
		initialState,
	);

	const [tableData, setTableData] = useState(null);
	const { isFetching, isLoading, isError, error, data } = useCertificates(
		offset,
		limit,
		sortBy,
		filters,
	);

	useEffect(() => {
		setTableData(data as any);
	}, [data]);

	const renewCert = async (id: number) => {
		try {
			await renewCertificate(id);
			toast({
				description: intl.formatMessage({
					id: `certificate.renewal-requested`,
				}),
				status: "info",
				position: "top",
				duration: 3000,
				isClosable: true,
			});
			setTimeout(() => {
				queryClient.invalidateQueries({ queryKey: ["certificates"] });
			}, 500);
		} catch (err: any) {
			toast({
				description: err.message,
				status: "error",
				position: "top",
				duration: 3000,
				isClosable: true,
			});
		}
	};

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

	// When there are no items and no filters active, show the nicer empty view
	if (data?.total === 0 && filters?.length === 0) {
		return (
			<EmptyList
				title={intl.formatMessage({ id: "create-certificate-title" })}
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
			onRenewal={renewCert}
		/>
	);
}

export default TableWrapper;
