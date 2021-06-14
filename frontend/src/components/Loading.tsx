import React from "react";

import styled from "styled-components";
import { Loader } from "tabler-react";

const Root = styled.div`
	text-align: center;
`;

function Loading() {
	return (
		<Root>
			<Loader />
		</Root>
	);
}

export { Loading };
