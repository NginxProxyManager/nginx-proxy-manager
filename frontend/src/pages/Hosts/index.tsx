import { useState } from "react";

import { Heading, HStack } from "@chakra-ui/react";

import { HelpDrawer, PrettyButton } from "src/components";
import { intl } from "src/locale";
import { HostCreateModal } from "src/modals";

import TableWrapper from "./TableWrapper";

function Hosts() {
	const [createShown, setCreateShown] = useState(false);

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>{intl.formatMessage({ id: "hosts.title" })}</Heading>
				<HStack>
					<HelpDrawer section="Hosts" />
					<PrettyButton size="sm" onClick={() => setCreateShown(true)}>
						{intl.formatMessage({ id: "host.create" })}
					</PrettyButton>
				</HStack>
			</HStack>
			<TableWrapper onCreateClick={() => setCreateShown(true)} />
			<HostCreateModal
				isOpen={createShown}
				onClose={() => setCreateShown(false)}
			/>
		</>
	);
}

export default Hosts;
