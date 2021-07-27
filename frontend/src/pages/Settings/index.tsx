import React, { useState, useEffect, useCallback } from "react";

import { SettingsResponse, requestSettings } from "api/npm";
import { Table } from "components";
import { SuspenseLoader } from "components";
import { intl } from "locale";
import { useInterval } from "rooks";
import styled from "styled-components";

const Root = styled.div`
	display: flex;
	flex-direction: column;
`;

function Settings() {
	const [data, setData] = useState({} as SettingsResponse);
	const [offset, setOffset] = useState(0);

	const asyncFetch = useCallback(() => {
		requestSettings(offset)
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
		{
			name: "id",
			title: intl.formatMessage({ id: "column.id", defaultMessage: "ID" }),
			formatter: "id",
			className: "w-1",
		},
		{
			name: "name",
			title: intl.formatMessage({ id: "column.name", defaultMessage: "Name" }),
		},
		{
			name: "description",
			title: intl.formatMessage({
				id: "column.description",
				defaultMessage: "Description",
			}),
		},
	];

	if (typeof data.items !== "undefined") {
		return (
			<Root>
				<div className="card">
					<div className="card-status-top bg-cyan" />
					<div className="card-header">
						<h3 className="card-title">
							{intl.formatMessage({
								id: "settings.title",
								defaultMessage: "Settings",
							})}
						</h3>
					</div>
					<Table
						columns={cols}
						data={data.items}
						sortBy={data.sort[0].field}
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

	return <SuspenseLoader />;
}

export default Settings;
