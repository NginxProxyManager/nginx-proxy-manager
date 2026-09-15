import cn from "classnames";
import { Field, useFormikContext } from "formik";
import { T } from "src/locale";
import { validateNumber } from "src/modules/Validations";

type FormValues = {
	assetCacheTtl: number;
	cachingEnabled: boolean;
};

interface Props {
	color?: string;
}

export function ProxyCacheOptionsFields({ color = "bg-cyan" }: Props) {
	const { values } = useFormikContext<FormValues>();
	const { assetCacheTtl, cachingEnabled } = values;

	const toggleRow = (name: "cachingEnabled", label: string, enabled: boolean) => (
		<div>
			<label className="row" htmlFor={name}>
				<span className="col">
					<T id={label} />
				</span>
				<span className="col-auto">
					<Field name={name} type="checkbox">
						{({ field }: any) => (
							<span className="form-check form-check-single form-switch">
								<input
									{...field}
									id={name}
									className={cn("form-check-input", {
										[color]: enabled,
									})}
									type="checkbox"
								/>
							</span>
						)}
					</Field>
				</span>
			</label>
		</div>
	);

	return (
		<>
			{toggleRow("cachingEnabled", "host.flags.cache-assets", cachingEnabled)}
			{cachingEnabled ? (
				<div className="py-3">
					<Field name="assetCacheTtl" validate={validateNumber(1, 31536000)}>
						{({ field, form }: any) => (
							<div>
								<label className="form-label" htmlFor="assetCacheTtl">
									<T id="host.cache-ttl" />
								</label>
								<input
									{...field}
									id="assetCacheTtl"
									type="number"
									min={1}
									max={31536000}
									value={assetCacheTtl}
									className={cn("form-control", {
										"is-invalid": form.errors.assetCacheTtl && form.touched.assetCacheTtl,
									})}
								/>
								{form.errors.assetCacheTtl && form.touched.assetCacheTtl ? (
									<div className="invalid-feedback">{form.errors.assetCacheTtl}</div>
								) : null}
								<small className="form-hint">
									<T id="host.cache-ttl-help" />
								</small>
							</div>
						)}
					</Field>
				</div>
			) : null}
		</>
	);
}
