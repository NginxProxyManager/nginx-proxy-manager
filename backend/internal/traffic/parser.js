// Parses the access log lines written by the nginx templates. Two formats are
// understood (see docker/rootfs/etc/nginx/conf.d/include/log-proxy.conf):
//
//   proxy:    [time] cache upstream_status status - METHOD scheme host "uri" [Client ip] [Length n] ...
//   standard: [time] status - METHOD scheme host "uri" [Client ip] [Length n] ...
//
// Stream hosts use their own format (log-stream.conf):
//
//   stream:   [time] [Client ip:port] protocol status bytes_sent bytes_received session_time ...
const LINE = /^\[([^\]]+)\] (?:\S+ \S+ )?(\d{3}) - (\S+) (\S+) (\S+) "([^"]*)" \[Client ([^\]]+)\] \[Length (\d+)\]/;
const STREAM_LINE = /^\[([^\]]+)\] \[Client ([^\]]+):\d+\] (\S+) (\d{3}) (\d+) (\d+) /;
const TIME = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/**
 * @param   {String} value  nginx $time_local, eg. 25/Oct/2026:10:11:12 +0000
 * @returns {Number|null}   unix seconds
 */
const parseTime = (value) => {
	const m = TIME.exec(value);
	if (!m || !(m[2] in MONTHS)) {
		return null;
	}
	const utc = Date.UTC(+m[3], MONTHS[m[2]], +m[1], +m[4], +m[5], +m[6]) / 1000;
	const offset = (+m[8] * 3600 + +m[9] * 60) * (m[7] === "-" ? -1 : 1);
	return utc - offset;
};

/**
 * @param   {String} line
 * @param   {String} [hostType]  "stream" for stream host logs, anything else for the HTTP formats
 * @returns {{ts: Number, status: Number, method: String, host: String, path: String, ip: String, bytes: Number}|null}
 */
const parseLine = (line, hostType = "proxy") => {
	if (hostType === "stream") {
		return parseStreamLine(line);
	}
	const m = LINE.exec(line);
	if (!m) {
		return null;
	}
	const ts = parseTime(m[1]);
	if (ts === null) {
		return null;
	}
	return {
		ts,
		status: Number.parseInt(m[2], 10),
		method: m[3],
		host: m[5],
		path: m[6].split("?")[0],
		ip: m[7],
		bytes: Number.parseInt(m[8], 10),
	};
};

const parseStreamLine = (line) => {
	const m = STREAM_LINE.exec(line);
	if (!m) {
		return null;
	}
	const ts = parseTime(m[1]);
	if (ts === null) {
		return null;
	}
	return {
		ts,
		status: Number.parseInt(m[4], 10),
		method: m[3],
		host: "",
		path: "",
		ip: m[2],
		bytes: Number.parseInt(m[5], 10),
	};
};

/**
 * Maps a log file name to the host it belongs to.
 *
 * @param   {String} name  eg. proxy-host-12_access.log
 * @returns {{host_type: String, host_id: Number}|null}
 */
const parseFileName = (name) => {
	const m = /^(proxy-host|redirection-host|dead-host|stream)-(\d+)_access\.log$/.exec(name);
	if (!m) {
		return null;
	}
	return { host_type: m[1].replace("-host", ""), host_id: Number.parseInt(m[2], 10) };
};

export { parseLine, parseFileName, parseTime };
