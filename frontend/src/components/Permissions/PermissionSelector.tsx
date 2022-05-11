import { ChangeEvent, MouseEventHandler } from "react";

import {
	Flex,
	Heading,
	Select,
	Stack,
	Text,
	useColorModeValue,
} from "@chakra-ui/react";
import { intl } from "locale";

interface PermissionSelectorProps {
	capabilities: string[];
	selected?: boolean;
	onClick: MouseEventHandler<HTMLElement>;
	onChange: (i: string[]) => any;
}

function PermissionSelector({
	capabilities,
	selected,
	onClick,
	onChange,
}: PermissionSelectorProps) {
	const textColor = useColorModeValue("gray.700", "gray.400");

	const onSelectChange = ({ target }: ChangeEvent<HTMLSelectElement>) => {
		// remove all items starting with target.name
		const i: string[] = [];
		const re = new RegExp(`^${target.name}\\.`, "g");
		capabilities.forEach((capability) => {
			if (!capability.match(re)) {
				i.push(capability);
			}
		});

		// add a new item, if value is something, and doesn't already exist
		if (target.value) {
			const c = `${target.name}.${target.value}`;
			if (i.indexOf(c) === -1) {
				i.push(c);
			}
		}

		onChange(i);
	};

	const getDefaultValue = (c: string): string => {
		if (capabilities.indexOf(`${c}.manage`) !== -1) {
			return "manage";
		}
		if (capabilities.indexOf(`${c}.view`) !== -1) {
			return "view";
		}
		return "";
	};

	return (
		<Stack
			onClick={onClick}
			style={{ cursor: "pointer", opacity: selected ? 1 : 0.4 }}
			borderWidth="1px"
			borderRadius="lg"
			w={{ sm: "100%" }}
			p={4}
			bg={useColorModeValue("white", "gray.900")}
			boxShadow={selected ? "2xl" : "base"}>
			<Heading fontSize="2xl" fontFamily="body">
				{intl.formatMessage({ id: "restricted-access" })}
			</Heading>
			{selected ? (
				<Stack spacing={3}>
					<Stack direction={{ base: "column", md: "row" }}>
						<Flex flex={1}>
							{intl.formatMessage({ id: "access-lists.title" })}
						</Flex>
						<Flex flex={1}>
							<Select
								defaultValue={getDefaultValue("access-lists")}
								onChange={onSelectChange}
								name="access-lists"
								size="sm"
								variant="filled"
								disabled={!selected}>
								<option value="">
									{intl.formatMessage({ id: "no-access" })}
								</option>
								<option value="manage">
									{intl.formatMessage({ id: "full-access" })}
								</option>
								<option value="view">
									{intl.formatMessage({ id: "view-only" })}
								</option>
							</Select>
						</Flex>
					</Stack>
					<Stack direction={{ base: "column", md: "row" }}>
						<Flex flex={1}>
							{intl.formatMessage({ id: "audit-log.title" })}
						</Flex>
						<Flex flex={1}>
							<Select
								defaultValue={getDefaultValue("audit-log")}
								onChange={onSelectChange}
								name="audit-log"
								size="sm"
								variant="filled"
								disabled={!selected}>
								<option value="">
									{intl.formatMessage({ id: "no-access" })}
								</option>
								<option value="view">
									{intl.formatMessage({ id: "view-only" })}
								</option>
							</Select>
						</Flex>
					</Stack>
					<Stack direction={{ base: "column", md: "row" }}>
						<Flex flex={1}>
							{intl.formatMessage({ id: "certificates.title" })}
						</Flex>
						<Flex flex={1}>
							<Select
								defaultValue={getDefaultValue("certificates")}
								onChange={onSelectChange}
								name="certificates"
								size="sm"
								variant="filled"
								disabled={!selected}>
								<option value="">
									{intl.formatMessage({ id: "no-access" })}
								</option>
								<option value="manage">
									{intl.formatMessage({ id: "full-access" })}
								</option>
								<option value="view">
									{intl.formatMessage({ id: "view-only" })}
								</option>
							</Select>
						</Flex>
					</Stack>
					<Stack direction={{ base: "column", md: "row" }}>
						<Flex flex={1}>
							{intl.formatMessage({ id: "certificate-authorities.title" })}
						</Flex>
						<Flex flex={1}>
							<Select
								defaultValue={getDefaultValue("certificate-authorities")}
								onChange={onSelectChange}
								name="certificate-authorities"
								size="sm"
								variant="filled"
								disabled={!selected}>
								<option value="">
									{intl.formatMessage({ id: "no-access" })}
								</option>
								<option value="manage">
									{intl.formatMessage({ id: "full-access" })}
								</option>
								<option value="view">
									{intl.formatMessage({ id: "view-only" })}
								</option>
							</Select>
						</Flex>
					</Stack>
					<Stack direction={{ base: "column", md: "row" }}>
						<Flex flex={1}>
							{intl.formatMessage({ id: "dns-providers.title" })}
						</Flex>
						<Flex flex={1}>
							<Select
								defaultValue={getDefaultValue("dns-providers")}
								onChange={onSelectChange}
								name="dns-providers"
								size="sm"
								variant="filled"
								disabled={!selected}>
								<option value="">
									{intl.formatMessage({ id: "no-access" })}
								</option>
								<option value="manage">
									{intl.formatMessage({ id: "full-access" })}
								</option>
								<option value="view">
									{intl.formatMessage({ id: "view-only" })}
								</option>
							</Select>
						</Flex>
					</Stack>
					<Stack direction={{ base: "column", md: "row" }}>
						<Flex flex={1}>{intl.formatMessage({ id: "hosts.title" })}</Flex>
						<Flex flex={1}>
							<Select
								defaultValue={getDefaultValue("hosts")}
								onChange={onSelectChange}
								name="hosts"
								size="sm"
								variant="filled"
								disabled={!selected}>
								<option value="">
									{intl.formatMessage({ id: "no-access" })}
								</option>
								<option value="manage">
									{intl.formatMessage({ id: "full-access" })}
								</option>
								<option value="view">
									{intl.formatMessage({ id: "view-only" })}
								</option>
							</Select>
						</Flex>
					</Stack>
					<Stack direction={{ base: "column", md: "row" }}>
						<Flex flex={1}>
							{intl.formatMessage({ id: "host-templates.title" })}
						</Flex>
						<Flex flex={1}>
							<Select
								defaultValue={getDefaultValue("host-templates")}
								onChange={onSelectChange}
								name="host-templates"
								size="sm"
								variant="filled"
								disabled={!selected}>
								<option value="">
									{intl.formatMessage({ id: "no-access" })}
								</option>
								<option value="manage">
									{intl.formatMessage({ id: "full-access" })}
								</option>
								<option value="view">
									{intl.formatMessage({ id: "view-only" })}
								</option>
							</Select>
						</Flex>
					</Stack>
					<Stack direction={{ base: "column", md: "row" }}>
						<Flex flex={1}>{intl.formatMessage({ id: "settings.title" })}</Flex>
						<Flex flex={1}>
							<Select
								defaultValue={getDefaultValue("settings")}
								onChange={onSelectChange}
								name="settings"
								size="sm"
								variant="filled"
								disabled={!selected}>
								<option value="">
									{intl.formatMessage({ id: "no-access" })}
								</option>
								<option value="manage">
									{intl.formatMessage({ id: "full-access" })}
								</option>
							</Select>
						</Flex>
					</Stack>
					<Stack direction={{ base: "column", md: "row" }}>
						<Flex flex={1}>{intl.formatMessage({ id: "users.title" })}</Flex>
						<Flex flex={1}>
							<Select
								defaultValue={getDefaultValue("users")}
								onChange={onSelectChange}
								name="users"
								size="sm"
								variant="filled"
								disabled={!selected}>
								<option value="">
									{intl.formatMessage({ id: "no-access" })}
								</option>
								<option value="manage">
									{intl.formatMessage({ id: "full-access" })}
								</option>
							</Select>
						</Flex>
					</Stack>
				</Stack>
			) : (
				<Text color={textColor}>
					{intl.formatMessage({ id: "restricted-access.description" })}
				</Text>
			)}
		</Stack>
	);
}

export { PermissionSelector };
