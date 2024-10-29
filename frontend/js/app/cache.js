const UserModel = require('../models/user');

let cache = {
    User:    new UserModel.Model(),
    locale:  navigator.languages[0].toLowerCase(),
    version: null
};

module.exports = cache;

