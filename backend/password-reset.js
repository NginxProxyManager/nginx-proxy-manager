#!/usr/bin/env node

// based on: https://github.com/jlesage/docker-nginx-proxy-manager/blob/796734a3f9a87e0b1561b47fd418f82216359634/rootfs/opt/nginx-proxy-manager/bin/reset-password

const fs = require('fs');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

function usage() {
	console.log(`usage: node ${process.argv[1]} USER_EMAIL PASSWORD

Reset password of a NPMplus user.

Arguments:
  USER_EMAIL      Email address of the user to reset the password.
  PASSWORD        Optional new password of the user. If not set, password is set to 'changeme'.`);
	process.exit(1);
}

const args = process.argv.slice(2);
const USER_EMAIL = args[0];
const PASSWORD = args[1];

if (!USER_EMAIL && !PASSWORD) {
	console.error('ERROR: User email address must be set.');
	console.error('ERROR: Password must be set.');
	usage();
}

if (!USER_EMAIL) {
	console.error('ERROR: User email address must be set.');
	usage();
}

if (!PASSWORD) {
	console.error('ERROR: Password must be set.');
	usage();
}

if (fs.existsSync('/data/npmplus/database.sqlite')) {
	bcrypt.hash(PASSWORD, 13, (err, PASSWORD_HASH) => {
		if (err) {
			console.error(err);
			process.exit(1);
		}
		const db = new Database('/data/npmplus/database.sqlite');

		try {
			const stmt = db.prepare(`
                UPDATE auth 
                SET secret = ? 
                WHERE EXISTS (
                    SELECT * 
                    FROM user 
                    WHERE user.id = auth.user_id AND user.email = ?
                )`);

			const result = stmt.run(PASSWORD_HASH, USER_EMAIL);

			if (result.changes > 0) {
				console.log(`Password for user ${USER_EMAIL} has been reset.`);
			} else {
				console.log(`No user found with email ${USER_EMAIL}.`);
			}
		} catch (error) {
			console.error(error);
			process.exit(1);
		} finally {
			db.close();
		}

		process.exit(0);
	});
} else {
	console.error('ERROR: Cannot connect to the sqlite database.');
	process.exit(1);
}
