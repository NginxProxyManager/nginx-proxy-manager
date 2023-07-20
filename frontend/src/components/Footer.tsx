import {
	Box,
	Container,
	Link,
	Stack,
	Text,
	Tooltip,
	useColorModeValue,
} from "@chakra-ui/react";

import { intl } from "src/locale";

function Footer() {
	return (
		<Box
			bg={useColorModeValue("gray.50", "gray.900")}
			color={useColorModeValue("gray.700", "gray.200")}>
			<Container
				as={Stack}
				maxW="6xl"
				py={4}
				direction={{ base: "column", md: "row" }}
				spacing={4}
				justify={{ base: "center", md: "space-between" }}
				align={{ base: "center", md: "center" }}>
				<Text>
					{intl.formatMessage(
						{ id: "footer.copyright" },
						{ year: new Date().getFullYear() },
					)}
				</Text>
				<Stack direction="row" spacing={6}>
					<Link
						href="https://nginxproxymanager.com?utm_source=npm"
						isExternal
						rel="noopener noreferrer">
						{intl.formatMessage({ id: "footer.userguide" })}
					</Link>
					<Link
						href="https://github.com/NginxProxyManager/nginx-proxy-manager/releases?utm_source=npm"
						isExternal
						rel="noopener noreferrer">
						{intl.formatMessage({ id: "footer.changelog" })}
					</Link>
					<Link
						href="https://github.com/NginxProxyManager/nginx-proxy-manager?utm_source=npm"
						isExternal
						rel="noopener noreferrer">
						{intl.formatMessage({ id: "footer.github" })}
					</Link>
					<Tooltip label={import.meta.env.VITE_APP_COMMIT}>
						<Link
							href="https://github.com/NginxProxyManager/nginx-proxy-manager/releases?utm_source=npm"
							isExternal
							rel="noopener noreferrer">
							v{import.meta.env.VITE_APP_VERSION}
						</Link>
					</Tooltip>
				</Stack>
			</Container>
		</Box>
	);
}

export { Footer };
