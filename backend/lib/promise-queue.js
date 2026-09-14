const createPromiseQueue = () => {
	let queue = Promise.resolve();

	return (callback) => {
		const queuedTask = queue.then(callback, callback);
		queue = queuedTask.catch(() => undefined);
		return queuedTask;
	};
};

export default createPromiseQueue;
