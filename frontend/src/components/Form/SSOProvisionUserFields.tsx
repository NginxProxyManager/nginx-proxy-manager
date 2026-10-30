import { IconMinus, IconPlus } from "@tabler/icons-react";
import cn from "classnames";
import { Field } from "formik";
import { useState } from "react";
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
	const [roleMap, setRoleMap] = useState(provisionRoleMap);
	const requireProvisionGroupNameIsRequired = (): boolean => {
		const test =
			(requireProvisionGroupName || "").length === 0 &&
			!!provisionUsers &&
			!!requireProvisionGroup &&
			(!roleMap || roleMap.length === 0 || roleMap[0].group === "");

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
						requireProvisionGroupNameIsRequired() ? 1 : 0,
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
										requireProvisionGroupNameIsRequired(),
									"opacity-50": !form.values.provisionUsers || !form.values.requireProvisionGroup,
								})}
								disabled={!form.values.provisionUsers || !form.values.requireProvisionGroup}
								placeholder={intl.formatMessage({ id: "sso.config.placeholder.group-name" })}
								defaultValue={form.values.requireProvisionGroupName}
								onChange={(e) => form.setFieldValue("requireProvisionGroupName", e.target.value)}
							/>
							{form.errors.requireProvisionGroupName && requireProvisionGroupNameIsRequired() && (
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
			{roleMap?.map((_, index) => {
				return (
					<div key={index} className="row">
						<div className="col-md-5">
							<Field
								name={`provisionRoleMap[${index}].group`}
								validate={validateString(
									index > 0 && index < roleMap.length - 1 && provisionUsers ? 1 : 0,
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
													form.errors.provisionRoleMap &&
													form.touched.provisionRoleMap &&
													form.values.requireGroup &&
													!!form.values.allowInternal,
												"opacity-50":
													!form.values.provisionUsers || !form.values.requireProvisionGroup,
											})}
											disabled={!form.values.provisionUsers || !form.values.requireProvisionGroup}
											placeholder={intl.formatMessage({
												id: "sso.config.placeholder.group-name",
											})}
											defaultValue={roleMap[index].group}
											onChange={(e) => {
												e.preventDefault();
												form.setFieldValue(`provisionRoleMap[${index}].group`, e.target.value);
												roleMap[index].group = e.target.value;
											}}
										/>
										{form.errors.provisionRoleMap && form.values.provisionUsers ? (
											<div className="invalid-feedback">
												{form.errors.provisionRoleMap && form.touched.provisionRoleMap
													? form.errors.provisionRoleMap
													: null}
											</div>
										) : null}
									</div>
								)}
							</Field>
						</div>

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
													!form.values.provisionUsers || !form.values.requireProvisionGroup,
											})}
											required
											defaultValue={roleMap[index].role}
											disabled={!form.values.provisionUsers || !form.values.requireProvisionGroup}
											onChange={(e) => {
												e.preventDefault();
												if (e.target.value) {
													form.setFieldValue(
														`provisionRoleMap[${index}].role`,
														e.target.value,
													);
													roleMap[index].role = e.target.value as ProvisionRoleMap["role"];
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
									if (roleMap.length === 1) {
										if (roleMap?.[0]) {
											roleMap[0].group = "";
										}
									} else {
										if (roleMap) {
											roleMap.splice(index, 1);
										}
									}
									setRoleMap([]);
									setTimeout(() => setRoleMap(roleMap));
								}}
								disabled={!roleMap?.[index]?.group || !provisionUsers || !requireProvisionGroup}
							>
								<IconMinus size={16} className="me-1" />
							</button>

							{index + 1 === roleMap.length && (
								<button
									type="button"
									className="btn ml-1 mt-1"
									data-index={index}
									onClick={(e) => {
										e.preventDefault();
										const newMap = [...roleMap];
										const entry = { role: "user" as ProvisionRoleMap["role"], group: "" };
										if (provisionRoleMap) {
											provisionRoleMap[index + 1] = entry;
										}
										newMap.push(entry);
										setRoleMap(newMap);
									}}
									disabled={
										!provisionRoleMap?.[index]?.group || !provisionUsers || !requireProvisionGroup
									}
								>
									<IconPlus size={16} className="me-1" />
								</button>
							)}
						</div>
					</div>
				);
			})}
			<small className="text-muted">
				<T id={"sso.config.access.role-map.hint"} />
			</small>
		</>
	);
}
