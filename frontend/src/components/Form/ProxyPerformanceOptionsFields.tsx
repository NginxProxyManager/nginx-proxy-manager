import cn from "classnames";
import { Field, useFormikContext } from "formik";
import type { ActionMeta, MultiValue } from "react-select";
import Select from "react-select";
import { T } from "src/locale";
import { validateNumber } from "src/modules/Validations";

type SelectOption = {
	label: string;
	value: string;
};

type FormValues = {
	assetCacheTtl: number;
	cachingEnabled: boolean;
	gzipCompLevel: number;
	gzipEnabled: boolean;
	gzipTypes: string[];
};

const gzipTypeOptions: SelectOption[] = [
	"application/atom+xml",
	"application/javascript",
	"application/json",
	"application/ld+json",
	"application/manifest+json",
	"application/rss+xml",
	"application/wasm",
	"application/xhtml+xml",
	"application/xml",
	"font/otf",
	"font/ttf",
	"image/svg+xml",
	"text/css",
	"text/plain",
	"text/xml",
].map((value) => ({ label: value, value }));

const compressionLevels = Array.from({ length: 9 }, (_, index) => index + 1);

interface Props {
	color?: string;
}

export function ProxyPerformanceOptionsFields({ color = "bg-cyan" }: Props) {
	const { values, setFieldValue } = useFormikContext<FormValues>();
	const { assetCacheTtl, cachingEnabled, gzipCompLevel, gzipEnabled, gzipTypes } = values;

	const handleGzipTypesChange = (
		selected: MultiValue<SelectOption>,
		_actionMeta: ActionMeta<SelectOption>,
	) => {
		setFieldValue(
			"gzipTypes",
			selected.map((option) => option.value),
		);
	};

	const toggleRow = (name: "cachingEnabled" | "gzipEnabled", label: string, enabled: boolean) => (
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

			{toggleRow("gzipEnabled", "host.flags.gzip", gzipEnabled)}
			{gzipEnabled ? (
				<div className="py-3">
					<div className="row align-items-end">
						<div className="col-md-3">
							<Field name="gzipCompLevel" validate={validateNumber(1, 9)}>
								{({ field, form }: any) => (
									<div>
										<label className="form-label" htmlFor="gzipCompLevel">
											<T id="host.gzip-level" />
										</label>
										<select
											{...field}
											id="gzipCompLevel"
											value={gzipCompLevel}
											className={cn("form-control", {
												"is-invalid": form.errors.gzipCompLevel && form.touched.gzipCompLevel,
											})}
										>
											{compressionLevels.map((level) => (
												<option key={level} value={level}>
													{level}
												</option>
											))}
										</select>
									</div>
								)}
							</Field>
						</div>
						<div className="col-md-9">
							<Field name="gzipTypes">
								{({ field }: any) => (
									<div>
										<label className="form-label" htmlFor="gzipTypes">
											<T id="host.gzip-types" />
										</label>
										<Select
											className="react-select-container"
											classNamePrefix="react-select"
											inputId="gzipTypes"
											name={field.name}
											options={gzipTypeOptions}
											value={gzipTypeOptions.filter((option) => gzipTypes.includes(option.value))}
											onChange={handleGzipTypesChange}
											closeMenuOnSelect={false}
											isClearable
											isMulti
										/>
									</div>
								)}
							</Field>
						</div>
					</div>
					<small className="form-hint mt-2">
						<T id="host.gzip-types-help" />
					</small>
				</div>
			) : null}
		</>
	);
}
