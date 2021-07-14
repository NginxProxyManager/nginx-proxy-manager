import React from "react";

import { Loader } from "components";
import styled from "styled-components";

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
