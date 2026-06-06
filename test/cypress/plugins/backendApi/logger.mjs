const log = (...args) => {
	const arr = args;
	arr.unshift("[Backend API]");
	console.log(...arr);
};

export default log;
