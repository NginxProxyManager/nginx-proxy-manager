import { useState } from "react";

import { Heading, HStack } from "@chakra-ui/react";
import { HelpDrawer, PrettyButton } from "components";
import { intl } from "locale";
import { AccessListCreateModal } from "modals";

import TableWrapper from "./TableWrapper";

function AccessLists() {
	const [createShown, setCreateShown] = useState(false);

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>
					{intl.formatMessage({ id: "access-lists.title" })}
				</Heading>
				<HStack>
					<HelpDrawer section="AccessLists" />
					<PrettyButton size="sm" onClick={() => setCreateShown(true)}>
						{intl.formatMessage({ id: "access-list.create" })}
					</PrettyButton>
				</HStack>
			</HStack>
			<TableWrapper onCreateClick={() => setCreateShown(true)} />
			<AccessListCreateModal
				isOpen={createShown}
				onClose={() => setCreateShown(false)}
			/>
		</>
	);
}

export default AccessLists;
