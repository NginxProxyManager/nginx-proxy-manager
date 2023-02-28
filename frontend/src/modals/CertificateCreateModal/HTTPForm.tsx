import { useState } from "react";

import {
	CertificateAuthorityField,
	DomainNamesField,
	EccField,
	NameField,
} from "./Common";

function HTTPForm() {
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
			<EccField />
		</>
	);
}

export default HTTPForm;
