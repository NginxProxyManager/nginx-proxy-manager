#!/usr/bin/env node

// based on: https://github.com/jlesage/docker-nginx-proxy-manager/blob/796734a3f9a87e0b1561b47fd418f82216359634/rootfs/opt/nginx-proxy-manager/bin/reset-password

const fs      = require('fs');
const bcrypt  = require('bcrypt');
const sqlite3 = require('sqlite3');

function usage() {
	console.log(`usage: node ${process.argv[1]} USER_EMAIL PASSWORD

Reset password of a Nginx Proxy Manager user.

Arguments:
  USER_EMAIL      Email address of the user to reset the password.
  PASSWORD        Optional new password of the user.  If not set, password
                  is set to 'changeme'.
`);
	process.exit(1);
}

const args = process.argv.slice(2);

const USER_EMAIL = args[0];
if (!USER_EMAIL) {
	console.error('ERROR: User email address must be set.');
	usage();
}

const PASSWORD = args[1];
if (!PASSWORD) {
	console.error('ERROR: Password must be set.');
	usage();
}

if (fs.existsSync(process.env.DB_SQLITE_FILE)) {
	bcrypt.hash(PASSWORD, 13, (err, PASSWORD_HASH) => {
		if (err) {
			console.error(err);
			process.exit(1);
		}

		const db = new sqlite3.Database(process.env.DB_SQLITE_FILE);
		db.run(
			`UPDATE auth SET secret = ? WHERE EXISTS
     (SELECT * FROM user WHERE user.id = auth.user_id AND user.email = ?)`,
			[PASSWORD_HASH, USER_EMAIL],
			function (err) {
				if (err) {
					console.error(err);
					process.exit(1);
				}

				console.log(`Password for user ${USER_EMAIL} has been reset.`);
				process.exit(0);
			}
		);
	});
}