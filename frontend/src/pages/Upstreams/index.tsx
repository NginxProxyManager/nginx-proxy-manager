import { useState } from "react";

import { Heading, HStack } from "@chakra-ui/react";
import { HelpDrawer, PrettyButton } from "components";
import { intl } from "locale";
import { UpstreamCreateModal } from "modals";

import TableWrapper from "./TableWrapper";

function Upstreams() {
	const [createShown, setCreateShown] = useState(false);

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>
					{intl.formatMessage({ id: "upstreams.title" })}
				</Heading>
				<HStack>
					<HelpDrawer section="Upstreams" />
					<PrettyButton size="sm" onClick={() => setCreateShown(true)}>
						{intl.formatMessage({ id: "upstream.create" })}
					</PrettyButton>
				</HStack>
			</HStack>
			<TableWrapper onCreateClick={() => setCreateShown(true)} />
			<UpstreamCreateModal
				isOpen={createShown}
				onClose={() => setCreateShown(false)}
			/>
		</>
	);
}

export default Upstreams;
