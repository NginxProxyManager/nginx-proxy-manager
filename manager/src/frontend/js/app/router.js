'use strict';

const Mn         = require('../lib/marionette');
const Controller = require('./controller');

module.exports = Mn.AppRouter.extend({
    appRoutes: {
        access:     'showAccess',
        '*default': 'showDashboard'
    },

    initialize: function () {
        this.controller = Controller;
    }
});
