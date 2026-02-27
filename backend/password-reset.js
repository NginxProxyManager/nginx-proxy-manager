#!/usr/bin/env node

// based on: https://github.com/jlesage/docker-nginx-proxy-manager/blob/796734a3f9a87e0b1561b47fd418f82216359634/rootfs/opt/nginx-proxy-manager/bin/reset-password

import { existsSync } from "node:fs";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

function usage() {
	console.log(`usage: node ${process.argv[1]} USER_EMAIL PASSWORD

Reset password of a NPMplus user.

Arguments:
  USER_EMAIL      Email address of the user to reset the password.
  PASSWORD        New password of the user.`);
	process.exit(1);
}

const args = process.argv.slice(2);
const USER_EMAIL = args[0];
const PASSWORD = args[1];

if (!USER_EMAIL || !PASSWORD) {
	if (!USER_EMAIL) console.error("ERROR: User email address must be set.");
	if (!PASSWORD) console.error("ERROR: Password must be set.");
	usage();
}

if (!existsSync("/data/npmplus/database.sqlite")) {
	console.error("ERROR: Cannot connect to the sqlite database.");
	process.exit(1);
}

let db;
try {
	db = new Database("/data/npmplus/database.sqlite");

	const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 13);
	const stmt = db.prepare(
		"UPDATE auth SET secret = ? WHERE EXISTS (SELECT * FROM user WHERE user.id = auth.user_id AND user.email = ?)",
	);
	const result = stmt.run(PASSWORD_HASH, USER_EMAIL);

	if (result.changes > 0) {
		console.log(`Password for user ${USER_EMAIL} has been reset.`);
	} else {
		console.log(`No user found with email ${USER_EMAIL}.`);
	}
} catch (error) {
	console.error(error);
	process.exitCode = 1;
} finally {
	if (db) db.close();
}
