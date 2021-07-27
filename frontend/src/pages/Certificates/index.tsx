import React from "react";

import { intl } from "locale";
import styled from "styled-components";

const Root = styled.div`
	display: flex;
	flex-direction: column;
`;

function Certificates() {
	return (
		<Root>
			<div className="card">
				<div className="card-status-top bg-cyan" />
				<div className="card-header">
					<h3 className="card-title">
						{intl.formatMessage({
							id: "certificates.title",
							defaultMessage: "Certificates",
						})}
					</h3>
				</div>
			</div>
		</Root>
	);
}

export default Certificates;
