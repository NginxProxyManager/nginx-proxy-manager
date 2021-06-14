import React, { ReactNode } from "react";

import { Footer } from "components";
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
`;

interface Props {
	children?: ReactNode;
}
function SinglePage({ children }: Props) {
	return (
		<Root>
			<Wrapper>{children}</Wrapper>
			<Footer />
		</Root>
	);
}

export { SinglePage };
