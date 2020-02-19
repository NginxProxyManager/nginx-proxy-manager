const internalProxyHost       = require('./proxy-host');
const internalRedirectionHost = require('./redirection-host');
const internalDeadHost        = require('./dead-host');
const internalStream          = require('./stream');

const internalReport = {

	/**
	 * @param  {Access}   access
	 * @return {Promise}
	 */
	getHostsReport: (access) => {
		return access.can('reports:hosts', 1)
			.then((access_data) => {
				let user_id = access.token.getUserId(1);

				let promises = [
					internalProxyHost.getCount(user_id, access_data.visibility),
					internalRedirectionHost.getCount(user_id, access_data.visibility),
					internalStream.getCount(user_id, access_data.visibility),
					internalDeadHost.getCount(user_id, access_data.visibility)
				];

				return Promise.all(promises);
			})
			.then((counts) => {
				return {
					proxy:       counts.shift(),
					redirection: counts.shift(),
					stream:      counts.shift(),
					dead:        counts.shift()
				};
			});

	}
};

module.exports = internalReport;
