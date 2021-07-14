import React from "react";

import { Loading } from "components";
import styled from "styled-components";

const Root = styled.div`
	display: flex;
	flex-direction: column;
	justify-content: center;
	min-height: 100%;
`;

const Wrapper = styled.div`
	flex: 1 1 auto;
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100px;
`;

function SuspenseLoader() {
	return (
		<Root>
			<Wrapper>
				<Loading />
			</Wrapper>
		</Root>
	);
}

export { SuspenseLoader };
