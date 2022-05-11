import { useState } from "react";

import { Heading, HStack } from "@chakra-ui/react";
import { HelpDrawer, PrettyButton } from "components";
import { intl } from "locale";
import { CertificateAuthorityCreateModal } from "modals";

import TableWrapper from "./TableWrapper";

function CertificateAuthorities() {
	const [createShown, setCreateShown] = useState(false);

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>
					{intl.formatMessage({ id: "certificate-authorities.title" })}
				</Heading>
				<HStack>
					<HelpDrawer section="CertificateAuthorities" />
					<PrettyButton size="sm" onClick={() => setCreateShown(true)}>
						{intl.formatMessage({ id: "certificate-authority.create" })}
					</PrettyButton>
				</HStack>
			</HStack>
			<TableWrapper />
			<CertificateAuthorityCreateModal
				isOpen={createShown}
				onClose={() => setCreateShown(false)}
			/>
		</>
	);
}

export default CertificateAuthorities;
