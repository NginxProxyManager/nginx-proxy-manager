import errs from "../lib/error.js";

const reconfigureDefaultSite = async (row, nginx) => {
	try {
		await nginx.deleteConfig("default");
		await nginx.generateConfig("default", row);
		await nginx.test();
		await nginx.reload();
		return row;
	} catch (err) {
		await nginx.deleteConfig("default");
		await nginx.test();
		await nginx.reload();
		throw new errs.ValidationError("Could not reconfigure Nginx. Please check logs.", err);
	}
};

export default reconfigureDefaultSite;
