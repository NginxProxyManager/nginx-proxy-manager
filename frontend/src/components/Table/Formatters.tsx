import { Avatar, Badge, Text, Tooltip } from "@chakra-ui/react";
import { RowAction, RowActionsMenu } from "components";
import { intl } from "locale";
import getNiceDNSProvider from "modules/Acmesh";

function ActionsFormatter(rowActions: RowAction[]) {
	const formatCell = (instance: any) => {
		return <RowActionsMenu data={instance.row.original} actions={rowActions} />;
	};

	return formatCell;
}

function BooleanFormatter() {
	const formatCell = ({ value }: any) => {
		return (
			<Badge color={value ? "cyan.500" : "red.400"}>
				{value ? "true" : "false"}
			</Badge>
		);
	};

	return formatCell;
}

function CapabilitiesFormatter() {
	const formatCell = ({ row, value }: any) => {
		const style = {} as any;
		if (row?.original?.isDisabled) {
			style.textDecoration = "line-through";
		}

		if (row?.original?.isSystem) {
			return (
				<Badge color="orange.400" style={style}>
					{intl.formatMessage({ id: "capability.system" })}
				</Badge>
			);
		}

		if (value?.indexOf("full-admin") !== -1) {
			return (
				<Badge color="teal.300" style={style}>
					{intl.formatMessage({ id: "capability.full-admin" })}
				</Badge>
			);
		}

		if (value?.length) {
			const strs: string[] = [];
			value.map((c: string) => {
				strs.push(intl.formatMessage({ id: `capability.${c}` }));
				return null;
			});

			return (
				<Tooltip label={strs.join(", \n")}>
					<Badge color="cyan.500" style={style}>
						{intl.formatMessage(
							{ id: "capability-count" },
							{ count: value.length },
						)}
					</Badge>
				</Tooltip>
			);
		}

		return null;
	};

	return formatCell;
}

function CertificateStatusFormatter() {
	const formatCell = ({ value }: any) => {
		return (
			<Badge color={value ? "cyan.500" : "red.400"}>
				{value
					? intl.formatMessage({ id: "ready" })
					: intl.formatMessage({ id: "setup-required" })}
			</Badge>
		);
	};

	return formatCell;
}

function DisabledFormatter() {
	const formatCell = ({ value, row }: any) => {
		if (row?.original?.isDisabled) {
			return (
				<Text color="red.500">
					<Tooltip label={intl.formatMessage({ id: "user.disabled" })}>
						{value}
					</Tooltip>
				</Text>
			);
		}
		return value;
	};

	return formatCell;
}

function DNSProviderFormatter() {
	const formatCell = ({ value }: any) => {
		return getNiceDNSProvider(value);
	};

	return formatCell;
}

function DomainsFormatter() {
	const formatCell = ({ value }: any) => {
		if (value?.length > 0) {
			return (
				<>
					{value.map((dom: string, idx: number) => {
						return (
							<Badge key={`domain-${idx}`} color="yellow.400">
								{dom}
							</Badge>
						);
					})}
				</>
			);
		}
		return <Badge color="red.400">No domains!</Badge>;
	};

	return formatCell;
}

function GravatarFormatter() {
	const formatCell = ({ value }: any) => {
		return <Avatar size="sm" src={value} />;
	};

	return formatCell;
}

function HostStatusFormatter() {
	const formatCell = ({ row }: any) => {
		if (row.original.isDisabled) {
			return (
				<Badge color="red.400">{intl.formatMessage({ id: "disabled" })}</Badge>
			);
		}

		if (row.original.certificateId) {
			if (row.original.certificate.status === "provided") {
				return (
					<Badge color="green.400">
						{row.original.sslForced
							? intl.formatMessage({ id: "https-only" })
							: intl.formatMessage({ id: "http-https" })}
					</Badge>
				);
			}

			if (row.original.certificate.status === "error") {
				return (
					<Tooltip label={row.original.certificate.errorMessage}>
						<Badge color="red.400">{intl.formatMessage({ id: "error" })}</Badge>
					</Tooltip>
				);
			}

			return (
				<Badge color="cyan.400">
					{intl.formatMessage({
						id: `certificate.${row.original.certificate.status}`,
					})}
				</Badge>
			);
		}

		return (
			<Badge color="orange.400">
				{intl.formatMessage({ id: "http-only" })}
			</Badge>
		);
	};

	return formatCell;
}

function UpstreamStatusFormatter() {
	const formatCell = ({ value, row }: any) => {
		if (value === "ready") {
			return (
				<Badge color="cyan.500">{intl.formatMessage({ id: "ready" })}</Badge>
			);
		}
		if (value === "ok") {
			return (
				<Badge color="green.500">{intl.formatMessage({ id: "ok" })}</Badge>
			);
		}
		if (value === "error") {
			return (
				<Tooltip label={row.original.errorMessage}>
					<Badge color="red.500">{intl.formatMessage({ id: "error" })}</Badge>
				</Tooltip>
			);
		}
	};

	return formatCell;
}

function HostTypeFormatter() {
	const formatCell = ({ value }: any) => {
		return intl.formatMessage({ id: `host-type.${value}` });
	};

	return formatCell;
}

function IDFormatter() {
	const formatCell = ({ value }: any) => {
		return <span className="text-muted">{value}</span>;
	};

	return formatCell;
}

function SecondsFormatter() {
	const formatCell = ({ value }: any) => {
		return intl.formatMessage({ id: "seconds" }, { seconds: value });
	};

	return formatCell;
}

export {
	ActionsFormatter,
	BooleanFormatter,
	CapabilitiesFormatter,
	CertificateStatusFormatter,
	DisabledFormatter,
	DNSProviderFormatter,
	DomainsFormatter,
	GravatarFormatter,
	HostStatusFormatter,
	HostTypeFormatter,
	IDFormatter,
	SecondsFormatter,
	UpstreamStatusFormatter,
};
