import { useState } from "react";

import { Heading, HStack } from "@chakra-ui/react";

import { HelpDrawer, PrettyButton } from "src/components";
import { intl } from "src/locale";
import { DNSProviderCreateModal } from "src/modals";

import TableWrapper from "./TableWrapper";

function DNSProviders() {
	const [createShown, setCreateShown] = useState(false);

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>
					{intl.formatMessage({ id: "dns-providers.title" })}
				</Heading>
				<HStack>
					<HelpDrawer section="DNSProviders" />
					<PrettyButton size="sm" onClick={() => setCreateShown(true)}>
						{intl.formatMessage({ id: "create-dns-provider" })}
					</PrettyButton>
				</HStack>
			</HStack>
			<TableWrapper onCreateClick={() => setCreateShown(true)} />
			<DNSProviderCreateModal
				isOpen={createShown}
				onClose={() => setCreateShown(false)}
			/>
		</>
	);
}

export default DNSProviders;
