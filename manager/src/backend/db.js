'use strict';

const db = require('diskdb');

module.exports = db.connect('/config', ['hosts', 'access']);
