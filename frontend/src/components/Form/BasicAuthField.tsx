import { useFormikContext } from "formik";
import { T } from "src/locale";

interface Props {
	id?: string;
	name?: string;
}
export function BasicAuthField({ name = "items", id = "items" }: Props) {
	const { setFieldValue } = useFormikContext();

	return (
		<>
			<div className="row">
				<div className="col-6">
					<label className="form-label" htmlFor="...">
						<T id="username" />
					</label>
				</div>
				<div className="col-6">
					<label className="form-label" htmlFor="...">
						<T id="password" />
					</label>
				</div>
			</div>
			<div className="row mb-3">
				<div className="col-6">
					<input id="name" type="text" required autoComplete="off" className="form-control" />
				</div>
				<div className="col-6">
					<input id="pw" type="password" required autoComplete="off" className="form-control" />
				</div>
			</div>
			<button className="btn">+</button>
		</>
	);
}
