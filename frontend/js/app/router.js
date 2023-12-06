const AppRouter  = require('marionette.approuter');
const Controller = require('./controller');

module.exports = AppRouter.default.extend({
    controller: Controller,
    appRoutes:  {
        users:                'showUsers',
        logout:               'logout',
        'nginx/proxy':        'showNginxProxy',
        'nginx/redirection':  'showNginxRedirection',
        'nginx/404':          'showNginxDead',
        'nginx/stream':       'showNginxStream',
        'nginx/access':       'showNginxAccess',
        'nginx/certificates': 'showNginxCertificates',
        'audit-log':          'showAuditLog',
        'openappsec-log':     'showOpenappsecLog',
        'settings':           'showSettings',
        '*default':           'showDashboard'
    }
});
