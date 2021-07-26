import React from "react";

import { FormattedMessage } from "react-intl";
import styled from "styled-components";

const Root = styled.div`
	display: flex;
	flex-direction: column;
`;

function Hosts() {
	return (
		<Root>
			<div className="card">
				<div className="card-status-top bg-cyan" />
				<div className="card-header">
					<h3 className="card-title">
						<FormattedMessage id="hosts.title" defaultMessage="Hosts" />
					</h3>
				</div>
			</div>
		</Root>
	);
}

export default Hosts;
