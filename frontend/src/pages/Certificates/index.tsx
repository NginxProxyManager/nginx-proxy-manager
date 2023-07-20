import { useState } from "react";

import {
	Heading,
	HStack,
	Menu,
	MenuList,
	MenuItem,
	MenuDivider,
} from "@chakra-ui/react";
import { FiGlobe, FiServer, FiShieldOff, FiUpload } from "react-icons/fi";

import { HelpDrawer, PrettyMenuButton } from "src/components";
import { useDNSProviders } from "src/hooks";
import { intl } from "src/locale";
import { CertificateCreateModal } from "src/modals";

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
