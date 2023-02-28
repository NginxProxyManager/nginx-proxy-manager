import { useState } from "react";

import {
	CertificateAuthorityField,
	DNSProviderField,
	DomainNamesField,
	EccField,
	NameField,
} from "./Common";

function DNSForm() {
	const [maxDomains, setMaxDomains] = useState(0);
	const [isWildcardSupported, setIsWildcardSupported] = useState(false);

	const handleCAChange = (maxD: number, wildcards: boolean) => {
		setMaxDomains(maxD);
		setIsWildcardSupported(wildcards);
	};

	return (
		<>
			<NameField />
			<CertificateAuthorityField onChange={handleCAChange} />
			<DomainNamesField
				maxDomains={maxDomains}
				isWildcardSupported={isWildcardSupported}
			/>
			<DNSProviderField />
			<EccField />
		</>
	);
}

export default DNSForm;
