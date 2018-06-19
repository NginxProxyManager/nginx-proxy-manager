'use strict';

const UserModel = require('../models/user');

let cache = {
    User: new UserModel.Model()
};

module.exports = cache;

