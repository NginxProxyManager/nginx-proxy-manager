import { ReactNode, useCallback, useEffect } from "react";

import { Box, Container, useToast } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";

import { getSSEToken, SSEMessage } from "src/api/npm";
import { Footer, Navigation } from "src/components";
import { intl } from "src/locale";
import AuthStore from "src/modules/AuthStore";

interface Props {
	children?: ReactNode;
}
function SiteWrapper({ children }: Props) {
	const queryClient = useQueryClient();
	const toast = useToast();

	const cb = useCallback(
		async function fetchData() {
			if (AuthStore.token) {
				return;
			}

			// Fetch the SSE token and set up the EventSource
			const response = await getSSEToken();
			const eventSource = new EventSource(
				`/api/sse/changes?jwt=${response.token}`,
			);
			eventSource.onmessage = (e: any) => {
				const j: SSEMessage = JSON.parse(e.data);
				if (j) {
					console.log("SSE Message:", j);
					if (j.affects) {
						queryClient.invalidateQueries({ queryKey: [j.affects] });
					}
					if (j.type) {
						toast({
							description: intl.formatMessage({ id: j.lang }),
							status: j.type || "info",
							position: "top",
							duration: 3000,
							isClosable: true,
						});
					}
				}
			};
			eventSource.onerror = (e) => {
				console.error("SSE EventSource failed:", e);
			};
			return () => {
				eventSource.close();
			};
		},
		[queryClient, toast],
	);

	// TODO: fix bug where this will fail if the browser is kept open longer
	// than the expiry of the sse token
	useEffect(() => {
		cb();
	});

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
