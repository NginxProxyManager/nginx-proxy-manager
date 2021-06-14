import React from "react";

import styled from "styled-components";
import { Alert } from "tabler-react";

const Root = styled.div`
	padding: 20vh 10vw 0 10vw;

	&& .ant-alert-warning {
		background-color: #2a2a2a;
		border: 2px solid #2ab1a4;
		color: #eee;
	}

	&& .ant-alert-message {
		color: #fff;
		font-size: 6vh;
	}

	&& .ant-alert-description {
		font-size: 4vh;
		line-height: 5vh;
	}

	&& .ant-alert-with-description {
		padding-left: 23vh;
	}

	&& .ant-alert-with-description .ant-alert-icon {
		font-size: 15vh;
	}
`;

function Unhealthy() {
	return (
		<Root>
			<Alert type="warning" icon="alert-triangle">
				Nginx Proxy Manager is <strong>unhealthy</strong>. We'll continue to
				check the health and hope to be back up and running soon!
			</Alert>
		</Root>
	);
}

export { Unhealthy };
