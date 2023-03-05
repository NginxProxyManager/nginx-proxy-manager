import {
	Avatar,
	Badge,
	Text,
	Tooltip,
	Popover,
	PopoverTrigger,
	PopoverContent,
	PopoverArrow,
	PopoverBody,
} from "@chakra-ui/react";
import { Monospace, RowAction, RowActionsMenu } from "components";
import { intl } from "locale";
import getNiceDNSProvider from "modules/Acmesh";

const errorColor = "red.400";

function ActionsFormatter(rowActions: RowAction[]) {
	const formatCell = (instance: any) => {
		return <RowActionsMenu data={instance.row.original} actions={rowActions} />;
	};

	return formatCell;
}

function BooleanFormatter() {
	const formatCell = ({ value }: any) => {
		return (
			<Badge color={value ? "cyan.500" : errorColor}>
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
	const formatCell = ({ value, row }: any) => {
		let color = "cyan.500";
		switch (value) {
			case "failed":
				color = errorColor;
				break;
			case "provided":
				color = "green.400";
				break;
			case "requesting":
				color = "yellow.400";
				break;
		}
		// special case for failed to show an error popover
		if (value === "failed" && row?.original?.errorMessage) {
			return (
				<Popover>
					<PopoverTrigger>
						<Badge color={color} style={{ cursor: "pointer" }}>
							{intl.formatMessage({ id: `status.${value}` })}
						</Badge>
					</PopoverTrigger>
					<PopoverContent>
						<PopoverArrow />
						<PopoverBody>
							<pre className="wrappable error">
								{row?.original?.errorMessage}
							</pre>
						</PopoverBody>
					</PopoverContent>
				</Popover>
			);
		}
		return (
			<Badge color={color}>
				{intl.formatMessage({ id: `status.${value}` })}
			</Badge>
		);
	};

	return formatCell;
}

function CertificateTypeFormatter() {
	const formatCell = ({ value }: any) => {
		let color = "cyan.500";
		if (value === "dns") {
			color = "green.400";
		}
		return (
			<Badge color={color}>{intl.formatMessage({ id: `type.${value}` })}</Badge>
		);
	};

	return formatCell;
}

function DisabledFormatter() {
	const formatCell = ({ value, row }: any) => {
		if (row?.original?.isDisabled) {
			return (
				<Text color={errorColor}>
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
		return <Badge color={errorColor}>No domains!</Badge>;
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
				<Badge color={errorColor}>
					{intl.formatMessage({ id: "disabled" })}
				</Badge>
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
						<Badge color={errorColor}>
							{intl.formatMessage({ id: "error" })}
						</Badge>
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

function MonospaceFormatter() {
	const formatCell = ({ value }: any) => {
		return <Monospace>{value}</Monospace>;
	};

	return formatCell;
}

function UpstreamStatusFormatter() {
	const formatCell = ({ value, row }: any) => {
		if (value === "ready") {
			return (
				<Badge color="cyan.500">
					{intl.formatMessage({ id: "status.ready" })}
				</Badge>
			);
		}
		if (value === "ok") {
			return (
				<Badge color="green.500">
					{intl.formatMessage({ id: "status.ok" })}
				</Badge>
			);
		}
		if (value === "error") {
			return (
				<Popover>
					<PopoverTrigger>
						<Badge color={errorColor} style={{ cursor: "pointer" }}>
							{intl.formatMessage({ id: "error" })}
						</Badge>
					</PopoverTrigger>
					<PopoverContent>
						<PopoverArrow />
						<PopoverBody>
							<pre className="wrappable error">
								{row?.original?.errorMessage}
							</pre>
						</PopoverBody>
					</PopoverContent>
				</Popover>
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
	CertificateTypeFormatter,
	DisabledFormatter,
	DNSProviderFormatter,
	DomainsFormatter,
	GravatarFormatter,
	HostStatusFormatter,
	HostTypeFormatter,
	IDFormatter,
	MonospaceFormatter,
	SecondsFormatter,
	UpstreamStatusFormatter,
};
