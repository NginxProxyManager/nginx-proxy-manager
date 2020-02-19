const UserModel = require('../models/user');

let cache = {
    User:    new UserModel.Model(),
    locale:  'en',
    version: null
};

module.exports = cache;

