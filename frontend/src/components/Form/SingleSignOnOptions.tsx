import { IconDots } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { intl, T } from "src/locale";
import AuthStore from "src/modules/AuthStore";
import Cookies from "universal-cookie";
import { SingleSignOnButton, type SingleSignOnIntegration } from "./SingleSignOnButton";

interface Props {
	isSubmitting: boolean;
	setFormErr: (message: string) => void;
	isOAuthInit: number;
	setOAuthInit: (index: number) => void;
	setSingleSignOnEnabled: (value: boolean) => void;
}
export function SingleSignOnOptions({
	isSubmitting,
	setFormErr,
	isOAuthInit,
	setOAuthInit,
	setSingleSignOnEnabled,
}: Props) {
	const [SingleSignOnConfig, setSingleSignOnConfig] = useState<SingleSignOnIntegration>(
		{} as SingleSignOnIntegration,
	);
	let checking = false;

	useEffect(() => {
		const checkSingleSignOnIntegration = async () => {
			if (checking) return;
			checking = true;
			try {
				const response = await fetch("/api/sso/is-enabled");
				const data: SingleSignOnIntegration = await response.json();
				setSingleSignOnConfig(data);
				setSingleSignOnEnabled(!!(data.configs && data.configs.length > 0));
			} catch {
				setSingleSignOnEnabled(false);
			}
		};
		if (!("enabled" in SingleSignOnConfig)) {
			checkSingleSignOnIntegration();
		}
	});

	const readOAuthAuthenticationErrorFromCookie = async () => {
		const cookies = new Cookies();
		const error = cookies.get("npm_sso_error");
		const cookieNames = ["npm_sso_error", "npm_sso_s", "npm_sso_n", "npm_sso_t", "npm_sso_e"];

		if (error) {
			const errors = decodeURIComponent(error)
				.split(";")
				.map((trKey) => intl.formatMessage({ id: trKey.trim() }));

			setFormErr(decodeURIComponent(errors.reverse().join("; ")));
		}
		cookieNames.forEach((cookie) => {
			cookies.remove(cookie, { path: "/" });
		});
	};

	if (SingleSignOnConfig?.enabled && !AuthStore.hasActiveToken()) {
		readOAuthAuthenticationErrorFromCookie();
	}

	return (
		<>
			{(SingleSignOnConfig.enabled &&
				SingleSignOnConfig.configs?.length &&
				SingleSignOnConfig.configs.map((config, index) => {
					return (
						<div key={config.id}>
							{index === 0 && (
								<>
									<div className="text-center mt-3 mb-2 text-azure">
										<IconDots />
									</div>
									<div className="pb-4 text-center">
										<T id="sso.login.heading" />
									</div>
								</>
							)}
							{index > 0 && (
								<div className="text-center text-azure">
									<hr className="mt-3 mb-2 border border-azure w-50 d-inline-block" />
								</div>
							)}
							<SingleSignOnButton {...{ config, isSubmitting, isOAuthInit, setFormErr, setOAuthInit }} />
						</div>
					);
				})) ||
				null}
		</>
	);
}
