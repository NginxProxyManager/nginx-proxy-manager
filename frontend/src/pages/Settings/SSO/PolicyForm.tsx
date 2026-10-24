import { Form, Formik } from "formik";
import type { SSOPolicy } from "src/api/backend";
import { Button } from "src/components";
import { intl, T } from "src/locale";

interface Props {
	policy: SSOPolicy;
	busy: boolean;
	onSave: (value: SSOPolicy) => Promise<void>;
}

export default function PolicyForm({ policy, busy, onSave }: Props) {
	return (
		<section className="mb-3">
			<Formik
				initialValues={policy}
				enableReinitialize
				validate={({ publicUrl }) => {
					try {
						const url = new URL(publicUrl);
						if (
							url.protocol === "https:" &&
							url.hostname &&
							!url.username &&
							!url.password &&
							/^https:\/\/[^/?#\s]+$/.test(publicUrl)
						)
							return {};
					} catch {}
					return { publicUrl: "settings.sso.publicUrlInvalid" };
				}}
				onSubmit={onSave}
			>
				{({ values, handleChange, handleBlur, errors, touched }) => (
					<Form aria-label="Login policy">
						<div className="mb-3">
							<div className="mb-3">
								<div className="form-label">
									<T id="settings.sso.mode" />
								</div>
								<select
									aria-label={intl.formatMessage({ id: "settings.sso.mode" })}
									id="sso-mode"
									name="mode"
									className="form-select"
									value={values.mode}
									onChange={handleChange}
								>
									<option value="parallel">
										{intl.formatMessage({ id: "settings.sso.modeParallel" })}
									</option>
									<option value="sso_only">
										{intl.formatMessage({ id: "settings.sso.modeSSOOnly" })}
									</option>
								</select>
							</div>
							<div>
								<div className="form-label">
									<T id="settings.sso.publicUrl" />
								</div>
								<input
									aria-label={intl.formatMessage({ id: "settings.sso.publicUrl" })}
									id="sso-public-url"
									name="publicUrl"
									type="url"
									required
									className={`form-control ${touched.publicUrl && errors.publicUrl ? "is-invalid" : ""}`}
									aria-invalid={!!(touched.publicUrl && errors.publicUrl)}
									aria-describedby={
										touched.publicUrl && errors.publicUrl ? "sso-public-url-error" : undefined
									}
									value={values.publicUrl}
									onChange={handleChange}
									onBlur={handleBlur}
									placeholder="https://npm.example.com"
								/>
								{touched.publicUrl && errors.publicUrl && (
									<div id="sso-public-url-error" className="invalid-feedback">
										<T id={errors.publicUrl} />
									</div>
								)}
							</div>
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
