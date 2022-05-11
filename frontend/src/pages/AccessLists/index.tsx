import { Heading } from "@chakra-ui/react";
import { intl } from "locale";

function AccessLists() {
	return (
		<Heading mb={2}>{intl.formatMessage({ id: "access-lists.title" })}</Heading>
	);
}

export default AccessLists;
