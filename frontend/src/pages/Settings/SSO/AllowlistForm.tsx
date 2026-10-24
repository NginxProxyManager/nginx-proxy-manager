import { Form, Formik } from "formik";
import { useState } from "react";
import type { SSOAllowlist } from "src/api/backend";
import { Button } from "src/components";
import { intl, T } from "src/locale";

const emailPattern = /^[^@\s<>*,;]+@[^@\s<>*,;]+\.[^@\s<>*,;]+$/;

export function normalizeEmailLines(raw: string): string[] | null {
	const emails = raw
		.split(/\r?\n/)
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);
	if (emails.some((email) => !emailPattern.test(email)) || new Set(emails).size !== emails.length) {
		return null;
	}
	return emails;
}

interface Props {
	allowlist: SSOAllowlist;
	busy: boolean;
	onSave: (value: SSOAllowlist) => Promise<void>;
}

export default function AllowlistForm({ allowlist, busy, onSave }: Props) {
	const [invalid, setInvalid] = useState(false);
	return (
		<section className="mb-3">
			<Formik
				initialValues={{ emails: allowlist.emails.join("\n") }}
				enableReinitialize
				onSubmit={async ({ emails }) => {
					const normalized = normalizeEmailLines(emails);
					if (!normalized) {
						setInvalid(true);
						return;
					}
					setInvalid(false);
					await onSave({ revision: allowlist.revision, emails: normalized });
				}}
			>
				{({ values, handleChange }) => (
					<Form aria-label="Trusted emails">
						<div className="mb-3">
							<p>
								<T id="settings.sso.directLinkWarning" />
							</p>
							<p className="text-secondary">
								<T id="settings.sso.pendingWarning" />
							</p>
							<div className="form-label">
								<T id="settings.sso.emails" />
							</div>
							<textarea
								aria-label={intl.formatMessage({ id: "settings.sso.emails" })}
								id="sso-emails"
								name="emails"
								rows={6}
								className={`form-control ${invalid ? "is-invalid" : ""}`}
								value={values.emails}
								onChange={handleChange}
							/>
							{invalid && (
								<div className="invalid-feedback">
									<T id="settings.sso.emailInvalid" />
								</div>
							)}
						</div>
						<div className="text-end">
							<Button type="submit" actionType="primary" disabled={busy} isLoading={busy}>
								<T id="settings.sso.save" />
							</Button>
						</div>
					</Form>
				)}
			</Formik>
		</section>
	);
}
