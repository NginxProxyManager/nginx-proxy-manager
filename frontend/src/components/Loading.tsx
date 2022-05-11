import { Box } from "@chakra-ui/react";
import { Loader } from "components";

function Loading() {
	return (
		<Box textAlign="center">
			<Loader />
		</Box>
	);
}

export { Loading };
