import { useState } from "react";

import { Heading, HStack } from "@chakra-ui/react";
import { HelpDrawer, PrettyButton } from "components";
import { intl } from "locale";
import { CertificateCreateModal } from "modals";

import TableWrapper from "./TableWrapper";

function Certificates() {
	const [createShown, setCreateShown] = useState(false);

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>
					{intl.formatMessage({ id: "certificates.title" })}
				</Heading>
				<HStack>
					<HelpDrawer section="Certificates" />
					<PrettyButton size="sm" onClick={() => setCreateShown(true)}>
						{intl.formatMessage({ id: "certificate.create" })}
					</PrettyButton>
				</HStack>
			</HStack>
			<TableWrapper onCreateClick={() => setCreateShown(true)} />
			<CertificateCreateModal
				isOpen={createShown}
				onClose={() => setCreateShown(false)}
			/>
		</>
	);
}

export default Certificates;
