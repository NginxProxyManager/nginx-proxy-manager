import { MouseEventHandler } from "react";

import { Heading, Stack, Text, useColorModeValue } from "@chakra-ui/react";
import { intl } from "locale";

interface AdminPermissionSelectorProps {
	selected?: boolean;
	onClick: MouseEventHandler<HTMLElement>;
}

function AdminPermissionSelector({
	selected,
	onClick,
}: AdminPermissionSelectorProps) {
	return (
		<Stack
			onClick={onClick}
			style={{ cursor: "pointer", opacity: selected ? 1 : 0.4 }}
			borderWidth="1px"
			borderRadius="lg"
			w={{ sm: "100%" }}
			mb={2}
			p={4}
			bg={useColorModeValue("white", "gray.900")}
			boxShadow={selected ? "2xl" : "base"}>
			<Heading fontSize="2xl" fontFamily="body">
				{intl.formatMessage({ id: "full-access" })}
			</Heading>
			<Text color={useColorModeValue("gray.700", "gray.400")}>
				{intl.formatMessage({ id: "full-access.description" })}
			</Text>
		</Stack>
	);
}

export { AdminPermissionSelector };
