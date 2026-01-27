import _ from "lodash";

export default () => {
	const arr = _.values(arguments);
	arr.unshift('[Backend API]');
	console.log.apply(null, arr);
};
