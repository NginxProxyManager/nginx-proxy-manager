import { useState } from "react";

import { Heading, HStack } from "@chakra-ui/react";

import { PrettyButton } from "src/components";
import { intl } from "src/locale";
import { UserCreateModal } from "src/modals";

import TableWrapper from "./TableWrapper";

function Users() {
	const [createShown, setCreateShown] = useState(false);

	return (
		<>
			<HStack mx={6} my={4} justifyContent="space-between">
				<Heading mb={2}>{intl.formatMessage({ id: "users.title" })}</Heading>
				<PrettyButton size="sm" onClick={() => setCreateShown(true)}>
					{intl.formatMessage({ id: "user.create" })}
				</PrettyButton>
			</HStack>
			<TableWrapper />
			<UserCreateModal
				isOpen={createShown}
				onClose={() => setCreateShown(false)}
			/>
		</>
	);
}

export default Users;
