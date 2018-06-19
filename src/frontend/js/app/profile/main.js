'use strict';

const Mn       = require('backbone.marionette');
const Cache    = require('../cache');
const template = require('./main.ejs');

module.exports = Mn.View.extend({
    template: template,
    id:       'profile',

    templateContext: {
        getUserField: function (field, default_val) {
            return Cache.User.get(field) || default_val;
        }
    },

    initialize: function () {
        this.model = Cache.User;
    }
});

