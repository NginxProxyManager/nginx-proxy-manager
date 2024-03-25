#!/usr/bin/env node

const fs = require('fs');
const sqlite3 = require('sqlite3');

if (fs.existsSync(process.env.DB_SQLITE_FILE)) {
	const db = new sqlite3.Database(process.env.DB_SQLITE_FILE, sqlite3.OPEN_READWRITE, (err) => {
		if (err) {
			console.error(err.message);
		} else {
			db.run('VACUUM; PRAGMA auto_vacuum = 1;', [], (err) => {
				if (err) {
					console.error(err.message);
				}
				db.close((err) => {
					if (err) {
						console.error(err.message);
					}
				});
			});
		}
	});
}
