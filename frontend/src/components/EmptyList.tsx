import { ReactNode } from "react";

import { Box, Heading, Text } from "@chakra-ui/react";

interface EmptyListProps {
	title: string;
	summary: string;
	createButton?: ReactNode;
}

function EmptyList({ title, summary, createButton }: EmptyListProps) {
	return (
		<Box textAlign="center" py={10} px={6}>
			<Heading as="h4" size="md" mt={6} mb={2}>
				{title}
			</Heading>
			<Text color="gray.500">{summary}</Text>
			{createButton}
		</Box>
	);
}

export { EmptyList };
