const Mn        = require('backbone.marionette');
const LoginView = require('./ui/login');
const i18n      = require('../app/i18n');

const App = Mn.Application.extend({
    region: '#login',
    UI:     null,

    onStart: function (/*app, options*/) {
        // 确保 i18n 系统已初始化
        if (typeof i18n.initialize === 'function') {
            i18n.initialize();
            console.log('i18n system initialized for login page');
        } else {
            console.error('i18n.initialize function not available on login page');
        }
        
        // 测试 i18n 功能
        console.log('Testing login i18n with version:', i18n('main', 'version', {version: '2.11.3'}));
        
        this.getRegion().show(new LoginView());
    }
});

const app      = new App();
module.exports = app;
