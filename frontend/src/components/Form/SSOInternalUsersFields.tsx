import cn from "classnames";
import { Field } from "formik";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";

interface Props {
	allowInternal?: boolean;
	requireGroup?: boolean;
}
export function AllowInternalUserFields({ allowInternal, requireGroup }: Props) {
	return (
		<>
			<div className="mb-1 mt-1">
				<label className="row" htmlFor="allowInternal">
					<h4 className="col mb-0">
						<T id="sso.config.access.allow-internal.label" />
					</h4>
					<span className="col-auto">
						<Field name="allowInternal" type="checkbox">
							{({ field, form }: any) => (
								<div className="form-floating form-check form-check-single form-switch">
									<input
										id="allowInternal"
										checked={field.value === true}
										className={cn("form-check-input", {
											"bg-indigo": field.checked,
										})}
										onChange={(e) => form.setFieldValue("allowInternal", e.target.checked)}
										type="checkbox"
									/>
								</div>
							)}
						</Field>
					</span>
				</label>
			</div>
			<small className="text-muted">
				<T id={"sso.config.access.allow-internal.hint"} />
			</small>
			<div className="mt-3">
				<label className="row" htmlFor="allowInternalIfAdmin">
					<h4
						className={cn("col", "mb-1", {
							"text-gray-500": !allowInternal,
						})}
					>
						<T id="sso.config.access.allow-internal-if-admin.label" />
					</h4>
					<span className="col-auto">
						<Field name="allowInternalIfAdmin" type="checkbox">
							{({ field, form }: any) => (
								<div className="form-floating form-check form-check-single form-switch">
									<input
										id="allowInternalIfAdmin"
										checked={field.value === true && !!form.values.allowInternal}
										className={cn("form-check-input", {
											"bg-indigo": field.checked && form.values.allowInternal,
										})}
										onChange={(e) => form.setFieldValue("allowInternalIfAdmin", e.target.checked)}
										disabled={!form.values.allowInternal}
										type="checkbox"
									/>
								</div>
							)}
						</Field>
					</span>
				</label>
			</div>
			<small className="text-muted">
				<T id={"sso.config.access.allow-internal-if-admin.hint"} />
			</small>
			<div className="mb-1 mt-3">
				<label className="row" htmlFor="requireGroup">
					<h4
						className={cn("col", {
							"text-gray-500": !allowInternal,
						})}
					>
						<T id="sso.config.access.require-group.label" />
					</h4>
					<span className="col-auto">
						<Field name="requireGroup" type="checkbox">
							{({ field, form }: any) => (
								<div className="form-floating form-check form-check-single form-switch">
									<input
										id="requireGroup"
										checked={field.value === true && form.values.allowInternal}
										className={cn("form-check-input", {
											"bg-indigo": field.checked && form.values.allowInternal,
										})}
										onChange={(e) => form.setFieldValue("requireGroup", e.target.checked)}
										disabled={!form.values.allowInternal}
										type="checkbox"
									/>
								</div>
							)}
						</Field>
					</span>
				</label>
			</div>
			<div className="col-md-6">
				<Field name="requireGroupName" validate={validateString(requireGroup ? 1 : 0, 255)}>
					{({ form }: any) => (
						<div className="mb-1 mt-2">
							<input
								id="requireGroupName"
								type="text"
								className={cn("form-control", "py-2", {
									"is-invalid":
										form.errors.requireGroupName &&
										form.touched.requireGroupName &&
										form.values.requireGroup &&
										!!form.values.allowInternal,
									"opacity-50": !form.values.allowInternal || !form.values.requireGroup,
								})}
								disabled={!form.values.allowInternal || !form.values.requireGroup}
								placeholder={intl.formatMessage({ id: "sso.config.placeholder.group-name" })}
								onBlur={(e) => form.setFieldValue("requireGroupName", e.target.value)}
								defaultValue={form.values.requireGroupName}
							/>
							{form.errors.requireGroupName && form.values.requireGroup ? (
								<div className="invalid-feedback">
									{form.errors.requireGroupName && form.touched.requireGroupName
										? form.errors.requireGroupName
										: null}
								</div>
							) : null}
						</div>
					)}
				</Field>
			</div>
			<small className="text-muted">
				<T id={"sso.config.access.require-group.hint"} />
			</small>
		</>
	);
}
