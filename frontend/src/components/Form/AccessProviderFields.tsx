import { Field, useFormikContext } from "formik";
import Alert from "react-bootstrap/Alert";
import { useAuthProviders } from "src/hooks";
import { intl, T } from "src/locale";

/**
 * Lets an access list accept accounts from an authentication provider, instead
 * of only the usernames typed into the list itself.
 *
 * Only LDAP providers are offered. SAML and OAuth authenticate by redirecting a
 * browser to the identity provider, which cannot happen inside the subrequest
 * nginx makes to check a request's credentials.
 */
export function AccessProviderFields() {
	const { values, setFieldValue } = useFormikContext<any>();
	const { data: providers, isLoading } = useAuthProviders();

	const usable = (providers || []).filter((p) => p.type === "ldap" && p.isEnabled);
	const selected: number[] = values.authProviderIds || [];

	const toggle = (id: number) => {
		setFieldValue("authProviderIds", selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
	};

	if (isLoading) {
		return null;
	}

	if (!usable.length) {
		return (
			<Alert variant="info" className="mb-0">
				<T id="access-list.providers-none" />
			</Alert>
		);
	}

	return (
		<>
			<p className="text-secondary">
				<T id="access-list.providers-intro" />
			</p>

			<div className="mb-3">
				{usable.map((provider) => (
					<label key={provider.id} className="form-check">
						<input
							type="checkbox"
							className="form-check-input"
							checked={selected.includes(provider.id)}
							onChange={() => toggle(provider.id)}
						/>
						<span className="form-check-label">{provider.name}</span>
					</label>
				))}
			</div>

			{selected.length ? (
				<Field name="allowedGroups">
					{({ field, form }: any) => (
						<div className="mb-3">
							<label htmlFor="allowedGroups" className="form-label">
								<T id="access-list.allowed-groups" />
							</label>
							<textarea
								id="allowedGroups"
								rows={4}
								className="form-control"
								placeholder={intl.formatMessage({ id: "access-list.allowed-groups-placeholder" })}
								value={(field.value || []).join("\n")}
								onChange={(e) =>
									form.setFieldValue(
										"allowedGroups",
										e.target.value
											.split("\n")
											.map((line) => line.trim())
											.filter(Boolean),
									)
								}
							/>
							<small className="form-hint">
								<T id="access-list.allowed-groups-help" />
							</small>
						</div>
					)}
				</Field>
			) : null}
		</>
	);
}
