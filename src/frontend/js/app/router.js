'use strict';

const Mn         = require('../lib/marionette');
const Controller = require('./controller');

module.exports = Mn.AppRouter.extend({
    appRoutes: {
        users:               'showUsers',
        profile:             'showProfile',
        logout:              'logout',
        'nginx/proxy':       'showNginxProxy',
        'nginx/redirection': 'showNginxRedirection',
        'nginx/404':         'showNginxDead',
        'nginx/stream':      'showNginxStream',
        'nginx/access':      'showNginxAccess',
        '*default':          'showDashboard'
    },

    initialize: function () {
        this.controller = Controller;
    }
});
