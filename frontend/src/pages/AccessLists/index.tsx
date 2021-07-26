import React from "react";

import { FormattedMessage } from "react-intl";
import styled from "styled-components";

const Root = styled.div`
	display: flex;
	flex-direction: column;
`;

function AccessLists() {
	return (
		<Root>
			<div className="card">
				<div className="card-status-top bg-cyan" />
				<div className="card-header">
					<h3 className="card-title">
						<FormattedMessage
							id="accesslists.title"
							defaultMessage="Access Lists"
						/>
					</h3>
				</div>
			</div>
		</Root>
	);
}

export default AccessLists;
