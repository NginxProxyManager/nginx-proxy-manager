import React, { useState, useEffect, useCallback } from "react";

import {
	CertificateAuthoritiesResponse,
	requestCertificateAuthorities,
} from "api/npm";
import { Table } from "components";
import { SuspenseLoader } from "components";
import { Badge } from "components";
import { intl } from "locale";
import { useInterval } from "rooks";
import styled from "styled-components";

const Root = styled.div`
	display: flex;
	flex-direction: column;
`;

function CertificateAuthorities() {
	const [data, setData] = useState({} as CertificateAuthoritiesResponse);
	const [offset, setOffset] = useState(0);

	const asyncFetch = useCallback(() => {
		requestCertificateAuthorities(offset)
			.then(setData)
			.catch((error: any) => {
				console.error("fetch data failed", error);
			});
	}, [offset]);

	useEffect(() => {
		asyncFetch();
	}, [asyncFetch]);

	// 1 Minute
	useInterval(asyncFetch, 1 * 60 * 1000, true);

	const cols = [
		/*
		{
			name: "id",
			title: intl.formatMessage({ id: "column.id", defaultMessage: "ID" }),
			formatter: "id",
			className: "w-1",
		},
		*/
		{
			name: "name",
			title: intl.formatMessage({ id: "column.name", defaultMessage: "Name" }),
		},
		{
			name: "maxDomains",
			title: intl.formatMessage({
				id: "column.max_domains",
				defaultMessage: "Max Domains",
			}),
		},
		{
			name: "isWildcardSupported",
			title: intl.formatMessage({
				id: "column.wildcard_support",
				defaultMessage: "Wildcard Support",
			}),
			formatter: "bool",
		},
		{
			name: "isSetup",
			title: intl.formatMessage({
				id: "column.status",
				defaultMessage: "Status",
			}),
			formatter: (val: boolean) => {
				return (
					<Badge color={val ? "lime" : "yellow"}>
						{val
							? intl.formatMessage({
									id: "ready",
									defaultMessage: "Ready",
							  })
							: intl.formatMessage({
									id: "setup-required",
									defaultMessage: "Setup Required",
							  })}
					</Badge>
				);
			},
		},
	];

	if (typeof data.total !== "undefined" && data.total) {
		return (
			<Root>
				<div className="card">
					<div className="card-status-top bg-orange" />
					<div className="card-header">
						<h3 className="card-title">
							{intl.formatMessage({
								id: "cert_authorities.title",
								defaultMessage: "Certificate Authorities",
							})}
						</h3>
					</div>
					<Table
						columns={cols}
						data={data.items}
						sortBy={data.sort[0].field}
						hasActions={true}
						pagination={{
							limit: data.limit,
							offset: data.offset,
							total: data.total,
							onSetOffset: (num: number) => {
								if (offset !== num) {
									setOffset(num);
								}
							},
						}}
					/>
				</div>
			</Root>
		);
	}

	if (typeof data.total !== "undefined") {
		return <p>No items!</p>;
	}

	return <SuspenseLoader />;
}

export default CertificateAuthorities;
