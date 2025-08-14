const _          = require('underscore');
const Backbone   = require('backbone');
const Mn         = require('../lib/marionette');
const Cache      = require('./cache');
const Controller = require('./controller');
const Router     = require('./router');
const Api        = require('./api');
const Tokens     = require('./tokens');
const UI         = require('./ui/main');
const i18n       = require('./i18n');

const App = Mn.Application.extend({

    Cache:      Cache,
    Api:        Api,
    UI:         null,
    i18n:       i18n,
    Controller: Controller,

    region: {
        el:             '#app',
        replaceElement: true
    },

    onStart: function (app, options) {
        // 确保 i18n 系统已初始化
        if (typeof i18n.initialize === 'function') {
            i18n.initialize();
            console.log('i18n system initialized');
        } else {
            console.error('i18n.initialize function not available');
        }
        
        // 测试 i18n 功能
        console.log('Testing i18n with welcome message:', i18n('main', 'welcome'));
        console.log('Testing i18n with version:', i18n('main', 'version', {version: '2.11.3'}));
        console.log('Testing i18n with name:', i18n('dashboard', 'title', {name: 'Test User'}));
        console.log('Testing i18n with date:', i18n('str', 'created-on', {date: '2024-01-01'}));

        // Check if token is coming through
        if (this.getParam('token')) {
            Tokens.addToken(this.getParam('token'));
        }

        // Check if we are still logged in by refreshing the token
        Api.status()
            .then(result => {
                Cache.version = [result.version.major, result.version.minor, result.version.revision].join('.');
            })
            .catch(err => {
                console.warn('Failed to get API version:', err.message);
                // 如果API调用失败，确保Cache.version有一个回退值
                if (!Cache.version) {
                    // 尝试从DOM获取编译时版本号
                    const appElement = document.getElementById('app');
                    if (appElement && appElement.dataset.version) {
                        Cache.version = appElement.dataset.version;
                    }
                }
            })
            .then(Api.Tokens.refresh)
            .then(this.bootstrap)
            .then(() => {
                console.info(i18n('main', 'logged-in', Cache.User.attributes));
                this.bootstrapTimer();
                this.refreshTokenTimer();

                this.UI = new UI();
                this.UI.on('render', () => {
                    new Router(options);
                    Backbone.history.start({pushState: true});

                    // Ask the admin use to change their details
                    if (Cache.User.get('email') === 'admin@example.com') {
                        Controller.showUserForm(Cache.User);
                    }
                });

                this.getRegion().show(this.UI);
            })
            .catch(err => {
                console.warn('Not logged in:', err.message);
                Controller.showLogin();
            });
    },

    History: {
        replace: function (data) {
            window.history.replaceState(_.extend(window.history.state || {}, data), document.title);
        },

        get: function (attr) {
            return window.history.state ? window.history.state[attr] : undefined;
        }
    },

    getParam: function (name) {
        name        = name.replace(/[\[\]]/g, '\\$&');
        let url     = window.location.href;
        let regex   = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
        let results = regex.exec(url);

        if (!results) {
            return null;
        }

        if (!results[2]) {
            return '';
        }

        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    },

    /**
     * Get user and other base info to start prime the cache and the application
     *
     * @returns {Promise}
     */
    bootstrap: function () {
        return Api.Users.getById('me', ['permissions'])
            .then(response => {
                console.log('Bootstrap user response:', response);
                if (response && typeof response === 'object') {
                    Cache.User.set(response);
                    Tokens.setCurrentName(response.nickname || response.name || response.email || 'Unknown User');
                } else {
                    console.error('Invalid user response:', response);
                }
            })
            .catch(error => {
                console.error('Bootstrap failed:', error);
                // 设置一个默认用户以避免应用崩溃
                Cache.User.set({
                    id: 0,
                    name: 'Unknown User',
                    nickname: '',
                    email: '',
                    roles: [],
                    permissions: null
                });
            });
    },

    /**
     * Bootstraps the user from time to time
     */
    bootstrapTimer: function () {
        setTimeout(() => {
            Api.status()
                .then(result => {
                    let version = [result.version.major, result.version.minor, result.version.revision].join('.');
                    if (version !== Cache.version) {
                        document.location.reload();
                    }
                })
                .then(this.bootstrap)
                .then(() => {
                    this.bootstrapTimer();
                })
                .catch(err => {
                    if (err.message !== 'timeout' && err.code && err.code !== 400) {
                        console.log(err);
                        console.error(err.message);
                        console.info('Not logged in?');
                        Controller.showLogin();
                    } else {
                        this.bootstrapTimer();
                    }
                });
        }, 30 * 1000); // 30 seconds
    },

    refreshTokenTimer: function () {
        setTimeout(() => {
            return Api.Tokens.refresh()
                .then(this.bootstrap)
                .then(() => {
                    this.refreshTokenTimer();
                })
                .catch(err => {
                    if (err.message !== 'timeout' && err.code && err.code !== 400) {
                        console.log(err);
                        console.error(err.message);
                        console.info('Not logged in?');
                        Controller.showLogin();
                    } else {
                        this.refreshTokenTimer();
                    }
                });
        }, 10 * 60 * 1000);
    }
});

const app      = new App();
module.exports = app;
