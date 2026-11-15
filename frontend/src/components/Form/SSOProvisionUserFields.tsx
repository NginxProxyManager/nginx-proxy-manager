import { IconMinus, IconPlus } from "@tabler/icons-react";
import cn from "classnames";
import { Field, FieldArray } from "formik";
import type { ProvisionRoleMap } from "src/api/backend";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";

interface Props {
	provisionRoleMap?: ProvisionRoleMap[];
	provisionUsers?: boolean;
	requireProvisionGroup?: boolean;
	requireProvisionGroupName?: string;
}
export function ProvisionUserFields({
	provisionRoleMap,
	provisionUsers,
	requireProvisionGroup,
	requireProvisionGroupName,
}: Props) {
	const provisionGroupNameIsRequired = (): boolean => {
		const test =
			(requireProvisionGroupName || "").length === 0 &&
			!!provisionUsers &&
			!!requireProvisionGroup &&
			(!provisionRoleMap || provisionRoleMap.length === 0 || provisionRoleMap[0].group === "");

		return test;
	};

	return (
		<>
			<div className="mb-1 mt-1">
				<label className="row" htmlFor="provisionUsers">
					<h4 className="col mb-0">
						<T id="sso.config.access.provision-user.label" />
					</h4>
					<span className="col-auto">
						<Field name="provisionUsers" type="checkbox">
							{({ field, form }: any) => (
								<div className="form-floating form-check form-check-single form-switch">
									<input
										id="provisionUsers"
										checked={field.value === true}
										className={cn("form-check-input", {
											"bg-indigo": field.checked,
										})}
										onChange={(e) => form.setFieldValue("provisionUsers", e.target.checked)}
										type="checkbox"
									/>
								</div>
							)}
						</Field>
					</span>
				</label>
			</div>
			<small className="text-muted">
				<T id={"sso.config.access.provision-user.hint"} />
			</small>
			<div className="mb-1 mt-3">
				<label className="row" htmlFor="requireProvisionGroup">
					<h4
						className={cn("col", {
							"text-gray-500": !provisionUsers,
						})}
					>
						<T id="sso.config.access.require-group.label" />
					</h4>
					<span className="col-auto">
						<Field name="requireProvisionGroup" type="checkbox">
							{({ field, form }: any) => (
								<div className="form-floating form-check form-check-single form-switch">
									<input
										id="requireProvisionGroup"
										checked={field.value === true && form.values.provisionUsers}
										className={cn("form-check-input", {
											"bg-indigo": field.checked && form.values.provisionUsers,
										})}
										onChange={(e) => form.setFieldValue("requireProvisionGroup", e.target.checked)}
										disabled={!form.values.provisionUsers}
										type="checkbox"
									/>
								</div>
							)}
						</Field>
					</span>
				</label>
			</div>
			<div className="col-md-6">
				<Field
					name="requireProvisionGroupName"
					validate={validateString(
						provisionGroupNameIsRequired() ? 1 : 0,
						255,
						"sso.error.group-or-role-map",
					)}
				>
					{({ form }: any) => (
						<div className="mb-1 mt-2">
							<input
								id="requireProvisionGroupName"
								type="text"
								className={cn({
									"form-control py-2": true,
									"is-invalid":
										form.errors.requireProvisionGroupName &&
										form.touched.requireProvisionGroupName &&
										provisionGroupNameIsRequired(),
									"opacity-50": !form.values.provisionUsers || !form.values.requireProvisionGroup,
								})}
								disabled={!form.values.provisionUsers || !form.values.requireProvisionGroup}
								placeholder={intl.formatMessage({ id: "sso.config.placeholder.group-name" })}
								defaultValue={form.values.requireProvisionGroupName}
								onChange={(e) => form.setFieldValue("requireProvisionGroupName", e.target.value)}
							/>
							{form.errors.requireProvisionGroupName && provisionGroupNameIsRequired() && (
								<div className="invalid-feedback">
									{form.errors.requireProvisionGroupName && form.touched.requireProvisionGroupName
										? form.errors.requireProvisionGroupName
										: null}
								</div>
							)}
						</div>
					)}
				</Field>
			</div>
			<small className="text-muted">
				<T id={"sso.config.access.require-group.hint"} />
			</small>
			<div className="mb-1 mt-3">
				<label className="row" htmlFor="provisionRoleMap">
					<span
						className={cn("col", {
							"text-gray-500": !provisionUsers || !requireProvisionGroup,
						})}
					>
						<T id="sso.config.access.role-map.label" />
					</span>
				</label>
			</div>
			{provisionRoleMap?.map((_, index) => {
				return (
					<div key={index} className="row">
						<div className="col-md-5">
							<Field
								name={`provisionRoleMap[${index}].group`}
								validate={validateString(
									index > 0 && index < provisionRoleMap.length - 1 && provisionUsers ? 1 : 0,
									255,
								)}
							>
								{({ form }: any) => (
									<div className="mb-1 mt-1">
										<input
											id={`provisionRoleMap[${index}].group`}
											type="text"
											className={cn("form-control py-2", {
												"is-invalid":
													!!form.errors.provisionRoleMap?.[index]?.group &&
													!!form.touched.provisionRoleMap?.[index]?.group &&
													form.values.allowInternal,
												"opacity-50":
													!form.values.provisionUsers || !form.values.requireProvisionGroup,
											})}
											disabled={!form.values.provisionUsers || !form.values.requireProvisionGroup}
											placeholder={intl.formatMessage({
												id: "sso.config.placeholder.group-name",
											})}
											defaultValue={provisionRoleMap[index].group}
											onChange={(e) => {
												e.preventDefault();
												form.setFieldValue(`provisionRoleMap[${index}].group`, e.target.value);
												provisionRoleMap[index].group = e.target.value;
											}}
										/>
										{form.errors.provisionRoleMap?.[index]?.group && form.values.provisionUsers && (
											<div className="invalid-feedback">
												{form.errors.provisionRoleMap?.[index]?.group &&
												form.touched.provisionRoleMap?.[index]?.group
													? form.errors.provisionRoleMap[index].group
													: null}
											</div>
										)}
									</div>
								)}
							</Field>
						</div>
						<FieldArray
							name="provisionRoleMap"
							render={(arrayHelpers) => (
								<>
									<div className="col-md-3">
										<Field name={`provisionRoleMap[${index}].role`}>
											{({ form }: any) => (
												<div>
													<select
														id={`provisionRoleMap[${index}].role`}
														className={cn("form-control mb-1 mt-1", {
															"is-invalid":
																form.errors.provisionRoleMap?.[index]?.role &&
																form.touched.provisionRoleMap?.[index]?.role,
															"opacity-50":
																!form.values.provisionUsers ||
																!form.values.requireProvisionGroup,
														})}
														required
														defaultValue={provisionRoleMap[index].role}
														disabled={
															!form.values.provisionUsers ||
															!form.values.requireProvisionGroup
														}
														onChange={(e) => {
															e.preventDefault();
															if (e.target.value) {
																form.setFieldValue(
																	`provisionRoleMap[${index}].role`,
																	e.target.value,
																);
																provisionRoleMap[index].role = e.target
																	.value as ProvisionRoleMap["role"];
															}
														}}
													>
														<option value="admin">admin</option>
														<option value="user">user</option>
													</select>
												</div>
											)}
										</Field>
									</div>
									<div className="col-md-4">
										<button
											type="button"
											className="btn mt-1"
											onClick={(e) => {
												e.isDefaultPrevented();
												if (provisionRoleMap.length === 1) {
													const entry = { group: "", role: provisionRoleMap[0].role };
													arrayHelpers.remove(0);
													setTimeout(() => arrayHelpers.push(entry));
												} else {
													arrayHelpers.remove(index);
												}
											}}
											disabled={
												!provisionRoleMap?.[index]?.group ||
												!provisionUsers ||
												!requireProvisionGroup
											}
										>
											<IconMinus size={16} className="me-1" />
										</button>

										{index + 1 === provisionRoleMap.length && (
											<button
												type="button"
												className="btn ml-1 mt-1"
												data-index={index}
												onClick={(e) => {
													e.preventDefault();
													const entry = {
														role: "user" as ProvisionRoleMap["role"],
														group: "",
													};
													arrayHelpers.push(entry);
												}}
												disabled={
													!provisionRoleMap?.[index]?.group ||
													!provisionUsers ||
													!requireProvisionGroup
												}
											>
												<IconPlus size={16} className="me-1" />
											</button>
										)}
									</div>
								</>
							)}
						/>
					</div>
				);
			})}
			<small className="text-muted">
				<T id={"sso.config.access.role-map.hint"} />
			</small>
		</>
	);
}
