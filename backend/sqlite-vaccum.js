#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('/data/npmplus/database.sqlite');

db.pragma('journal_mode = WAL');
db.pragma('auto_vacuum = 1');
db.exec('VACUUM;');
db.close();
