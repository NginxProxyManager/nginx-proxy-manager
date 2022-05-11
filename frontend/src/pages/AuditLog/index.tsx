import { Heading } from "@chakra-ui/react";
import { intl } from "locale";

function AuditLog() {
	return (
		<Heading mb={2}>{intl.formatMessage({ id: "audit-log.title" })}</Heading>
	);
}

export default AuditLog;
