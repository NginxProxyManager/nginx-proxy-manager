import { useState } from "react";

import {
	Heading,
	HStack,
	Menu,
	MenuList,
	MenuItem,
	MenuDivider,
} from "@chakra-ui/react";
import { HelpDrawer, PrettyMenuButton } from "components";
import { useDNSProviders } from "hooks";
import { intl } from "locale";
import { CertificateCreateModal } from "modals";
import { FiGlobe, FiServer, FiShieldOff, FiUpload } from "react-icons/fi";

import TableWrapper from "./TableWrapper";

function Certificates() {
	const [createShown, setCreateShown] = useState("");
	const { data: dnsProviders, isLoading: dnsProvidersIsLoading } =
		useDNSProviders(0, 999);

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>
					{intl.formatMessage({ id: "certificates.title" })}
				</Heading>
				<HStack>
					<HelpDrawer section="Certificates" />
					<Menu>
						<PrettyMenuButton>
							{intl.formatMessage({ id: "certificate.create" })}
						</PrettyMenuButton>
						<MenuList>
							<MenuItem
								icon={<FiGlobe />}
								onClick={() => setCreateShown("http")}>
								{intl.formatMessage({ id: "type.http" })}
							</MenuItem>
							<MenuItem
								isDisabled={dnsProvidersIsLoading || !dnsProviders?.total}
								icon={<FiServer />}
								onClick={() => setCreateShown("dns")}>
								{intl.formatMessage({ id: "type.dns" })}
							</MenuItem>
							<MenuDivider />
							<MenuItem
								icon={<FiUpload />}
								onClick={() => setCreateShown("custom")}>
								{intl.formatMessage({ id: "type.custom" })}
							</MenuItem>
							<MenuItem
								icon={<FiShieldOff />}
								onClick={() => setCreateShown("mkcert")}>
								{intl.formatMessage({ id: "type.mkcert" })}
							</MenuItem>
						</MenuList>
					</Menu>
				</HStack>
			</HStack>
			<TableWrapper />
			<CertificateCreateModal
				isOpen={createShown !== ""}
				certType={createShown}
				onClose={() => setCreateShown("")}
			/>
		</>
	);
}

export default Certificates;
