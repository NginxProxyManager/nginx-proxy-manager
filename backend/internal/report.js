import internalDeadHost from "./dead-host.js";
import internalProxyHost from "./proxy-host.js";
import internalRedirectionHost from "./redirection-host.js";
import internalStream from "./stream.js";

const internalReport = {
	/**
	 * @param  {Access}   access
	 * @return {Promise}
	 */
	getHostsReport: (access) => {
		return access
			.can("reports:hosts", 1)
			.then((access_data) => {
				const userId = access.token.getUserId(1);

				const promises = [
					internalProxyHost.getCount(userId, access_data.permission_visibility),
					internalRedirectionHost.getCount(userId, access_data.permission_visibility),
					internalStream.getCount(userId, access_data.permission_visibility),
					internalDeadHost.getCount(userId, access_data.permission_visibility),
				];

				return Promise.all(promises);
			})
			.then((counts) => {
				return {
					proxy: counts.shift(),
					redirection: counts.shift(),
					stream: counts.shift(),
					dead: counts.shift(),
				};
			});
	},
};

export default internalReport;
