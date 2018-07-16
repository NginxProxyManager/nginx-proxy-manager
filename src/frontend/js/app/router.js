'use strict';

const Mn         = require('../lib/marionette');
const Controller = require('./controller');

module.exports = Mn.AppRouter.extend({
    appRoutes: {
        users:               'showUsers',
        logout:              'logout',
        'nginx/proxy':       'showNginxProxy',
        'nginx/redirection': 'showNginxRedirection',
        'nginx/404':         'showNginxDead',
        'nginx/stream':      'showNginxStream',
        'nginx/access':      'showNginxAccess',
        'audit-log':         'showAuditLog',
        '*default':          'showDashboard'
    },

    initialize: function () {
        this.controller = Controller;
    }
});
