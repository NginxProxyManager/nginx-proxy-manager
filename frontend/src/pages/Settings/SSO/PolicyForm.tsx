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
		<section className="card mb-3">
			<div className="card-header">
				<h3 className="card-title">
					<T id="settings.sso.policy" />
				</h3>
			</div>
			<Formik initialValues={policy} enableReinitialize onSubmit={onSave}>
				{({ values, handleChange }) => (
					<Form aria-label="Login policy">
						<div className="card-body">
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
									className="form-control"
									value={values.publicUrl}
									onChange={handleChange}
									placeholder="https://npm.example.com"
								/>
							</div>
						</div>
						<div className="card-footer text-end">
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
