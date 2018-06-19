'use strict';

const Mn         = require('../lib/marionette');
const Controller = require('./controller');

module.exports = Mn.AppRouter.extend({
    appRoutes: {
        users:      'showUsers',
        profile:    'showProfile',
        logout:     'logout',
        '*default': 'showDashboard'
    },

    initialize: function () {
        this.controller = Controller;
    }
});
