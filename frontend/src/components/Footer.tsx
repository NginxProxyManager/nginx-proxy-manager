import React from "react";

import {
	Box,
	Container,
	Stack,
	Text,
	useColorModeValue,
} from "@chakra-ui/react";
import { intl } from "locale";

function Footer() {
	return (
		<Box
			bg={useColorModeValue("gray.50", "gray.900")}
			color={useColorModeValue("gray.700", "gray.200")}>
			<Container
				as={Stack}
				maxW={"6xl"}
				py={4}
				direction={{ base: "column", md: "row" }}
				spacing={4}
				justify={{ base: "center", md: "space-between" }}
				align={{ base: "center", md: "center" }}>
				<Text>
					{intl.formatMessage(
						{
							id: "footer.copyright",
							defaultMessage: "Copyright © {year} jc21.com",
						},
						{ year: new Date().getFullYear() },
					)}
				</Text>
				<Stack direction={"row"} spacing={6}>
					<a
						href="https://nginxproxymanager.com?utm_source=npm"
						target="_blank"
						rel="noreferrer"
						className="link-secondary">
						{intl.formatMessage({
							id: "footer.userguide",
							defaultMessage: "User Guide",
						})}
					</a>
					<a
						href="https://github.com/jc21/nginx-proxy-manager/releases?utm_source=npm"
						target="_blank"
						rel="noreferrer"
						className="link-secondary">
						{intl.formatMessage({
							id: "footer.changelog",
							defaultMessage: "Change Log",
						})}
					</a>
					<a
						href="https://github.com/jc21/nginx-proxy-manager?utm_source=npm"
						target="_blank"
						rel="noreferrer"
						className="link-secondary">
						{intl.formatMessage({
							id: "footer.github",
							defaultMessage: "Github",
						})}
					</a>
					<a
						href="https://github.com/jc21/nginx-proxy-manager/releases?utm_source=npm"
						target="_blank"
						rel="noopener noreferrer">
						v{process.env.REACT_APP_VERSION} {String.fromCharCode(183)}{" "}
						{process.env.REACT_APP_COMMIT}
					</a>
				</Stack>
			</Container>
		</Box>
	);
}

export { Footer };
