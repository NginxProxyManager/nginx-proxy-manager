import _  from "lodash";

export default (default_sort, default_offset, default_limit, max_limit) => {
	/**
	 * This will setup the req query params with filtered data and defaults
	 *
	 * sort    will be an array of fields and their direction
	 * offset  will be an int, defaulting to zero if no other default supplied
	 * limit   will be an int, defaulting to 50 if no other default supplied, and limited to the max if that was supplied
	 *
	 */

	return (req, _res, next) => {
		req.query.offset =
			typeof req.query.limit === "undefined" ? default_offset || 0 : Number.parseInt(req.query.offset, 10);
		req.query.limit =
			typeof req.query.limit === "undefined" ? default_limit || 50 : Number.parseInt(req.query.limit, 10);

		if (max_limit && req.query.limit > max_limit) {
			req.query.limit = max_limit;
		}

		// Sorting
		let sort = typeof req.query.sort === "undefined" ? default_sort : req.query.sort;
		const myRegexp = /.*\.(asc|desc)$/gi;
		const sort_array = [];

		sort = sort.split(",");
		_.map(sort, (val) => {
			const matches = myRegexp.exec(val);

			if (matches !== null) {
				const dir = matches[1];
				sort_array.push({
					field: val.substr(0, val.length - (dir.length + 1)),
					dir: dir.toLowerCase(),
				});
			} else {
				sort_array.push({
					field: val,
					dir: "asc",
				});
			}
		});

		// Sort will now be in this format:
		// [
		//    { field: 'field1', dir: 'asc' },
		//    { field: 'field2', dir: 'desc' }
		// ]

		req.query.sort = sort_array;
		next();
	};
};
