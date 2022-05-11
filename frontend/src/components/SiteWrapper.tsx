import { ReactNode } from "react";

import { Box, Container } from "@chakra-ui/react";
import { Footer, Navigation } from "components";

interface Props {
	children?: ReactNode;
}
function SiteWrapper({ children }: Props) {
	return (
		<Box display="flex" flexDir="column" height="100vh">
			<Box flexShrink={0}>
				<Navigation />
			</Box>
			<Box flex="1 0 auto" overflow="auto">
				<Container
					as="main"
					maxW="container.xl"
					overflowY="auto"
					py={4}
					h="full">
					{children}
				</Container>
			</Box>
			<Box flexShrink={0}>
				<Footer />
			</Box>
		</Box>
	);
}

export { SiteWrapper };
