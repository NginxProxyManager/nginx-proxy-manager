import { Heading } from "@chakra-ui/react";
import { intl } from "locale";

import TableWrapper from "./TableWrapper";

function AccessLists() {
	return (
		<>
			<Heading mb={2}>
				{intl.formatMessage({ id: "access-lists.title" })}
			</Heading>
			<TableWrapper />
		</>
	);
}

export default AccessLists;
