import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import { Button, Loading } from "src/components";
import { useSetSetting, useSetting } from "src/hooks";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { toFormValues, toPayload } from "./trafficStatsForm";
import { useQueryClient } from "@tanstack/react-query";

export default function TrafficStats() {
	const { data, isLoading, error } = useSetting("traffic-stats");
	const { mutate: setSetting } = useSetSetting();
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = toPayload(values);

		setSetting(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: ["traffic-report"] });
				showObjectSuccess("setting", "saved");
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	if (!isLoading && error) {
		return (
			<div className="card-body">
				<div className="mb-3">
					<Alert variant="danger" show>
						{error.message}
					</Alert>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="card-body">
				<div className="mb-3">
					<Loading noLogo />
				</div>
			</div>
		);
	}

	return (
		<Formik initialValues={toFormValues(data) as any} onSubmit={onSubmit}>
			{({ values }) => {
				const useInflux = !!(values.influxUrl && values.influxOrg && values.influxBucket && values.influxToken);
				return (
					<Form>
						<div className="card-body">
							<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
								{errorMsg}
							</Alert>
							<Field name="enabled">
								{({ field }: any) => (
									<div className="mb-3">
										<label className="form-check form-switch">
											<input
												id="traffic-enabled"
												className="form-check-input"
												type="checkbox"
												{...field}
												checked={!!field.value}
											/>
											<span className="form-check-label">
												<T id="settings.traffic-stats.enable" />
											</span>
										</label>
										<div className="form-hint">
											<T id="settings.traffic-stats.enable.hint" />
										</div>
									</div>
								)}
							</Field>
							{values.enabled && (
								<>
									<div className="row mb-3">
										<div className="col-md-6">
											<label className="form-label" htmlFor="retentionDays">
												<T id="settings.traffic-stats.retention" />
											</label>
											<Field
												id="retentionDays"
												name="retentionDays"
												type="number"
												min={1}
												max={3650}
												className="form-control"
											/>
										</div>
										<div className="col-md-6">
											<label className="form-label" htmlFor="range_hours">
												<T id="settings.traffic-stats.range" />
											</label>
											<Field
												id="range_hours"
												name="rangeHours"
												type="number"
												min={1}
												className="form-control"
											/>
										</div>
									</div>
									<Field name="geoip">
										{({ field }: any) => (
											<div className="mb-3">
												<label className="form-check form-switch">
													<input
														id="traffic-geoip"
														className="form-check-input"
														type="checkbox"
														{...field}
														checked={!!field.value}
													/>
													<span className="form-check-label">
														<T id="settings.traffic-stats.geoip" />
													</span>
												</label>
												<div className="form-hint">
													<T id="settings.traffic-stats.geoip.hint" />
												</div>
											</div>
										)}
									</Field>
									<Field name="statusCodes">
										{({ field }: any) => (
											<div className="mb-3">
												<label className="form-check form-switch">
													<input
														id="traffic-status-codes"
														className="form-check-input"
														type="checkbox"
														{...field}
														checked={!!field.value}
													/>
													<span className="form-check-label">
														<T id="settings.traffic-stats.status-codes" />
													</span>
												</label>
												<div className="form-hint">
													<T id="settings.traffic-stats.status-codes.hint" />
												</div>
											</div>
										)}
									</Field>
									<h4 className="mt-4">
										<T id="settings.traffic-stats.influx" />
									</h4>
									<p className="text-secondary">
										<T id="settings.traffic-stats.influx.hint" />
									</p>
									<div className="row mb-3">
										<div className="col-md-6 mb-3">
											<label className="form-label" htmlFor="influx_url">
												URL
											</label>
											<Field
												id="influx_url"
												name="influxUrl"
												type="text"
												placeholder="http://influxdb:8086"
												autoComplete="off"
												className="form-control"
											/>
										</div>
										<div className="col-md-6 mb-3">
											<label className="form-label" htmlFor="influx_org">
												Organization
											</label>
											<Field
												id="influx_org"
												name="influxOrg"
												type="text"
												autoComplete="off"
												className="form-control"
											/>
										</div>
										<div className="col-md-6 mb-3">
											<label className="form-label" htmlFor="influx_bucket">
												Bucket
											</label>
											<Field
												id="influx_bucket"
												name="influxBucket"
												type="text"
												autoComplete="off"
												className="form-control"
											/>
										</div>
										<div className="col-md-6 mb-3">
											<label className="form-label" htmlFor="influx_token">
												Token
											</label>
											<Field
												id="influx_token"
												name="influxToken"
												type="password"
												autoComplete="new-password"
												className="form-control"
											/>
										</div>
									</div>
									<Alert variant={useInflux ? "info" : "secondary"} show>
										<T
											id={
												useInflux
													? "settings.traffic-stats.using-influx"
													: "settings.traffic-stats.using-local"
											}
										/>
									</Alert>
								</>
							)}
						</div>
						<div className="card-footer bg-transparent mt-auto">
							<div className="btn-list justify-content-end">
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto bg-teal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							</div>
						</div>
					</Form>
				);
			}}
		</Formik>
	);
}
