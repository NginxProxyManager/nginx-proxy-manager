import React from "react";

import { useAuthState } from "context";
import styled from "styled-components";

const Root = styled.div`
	display: flex;
	flex-direction: column;
`;

function Dashboard() {
	const { logout } = useAuthState();

	return (
		<Root>
			Dashboard
			<div>
				<button onClick={logout}>Logout</button>
			</div>
		</Root>
	);
}

export default Dashboard;
