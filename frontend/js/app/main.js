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
        console.log(i18n('main', 'welcome'));

        // Check if token is coming through
        if (this.getParam('token')) {
            Tokens.addToken(this.getParam('token'));
        }

        // Check if we are still logged in by refreshing the token
        Api.status()
            .then(result => {
                Cache.version = [result.version.major, result.version.minor, result.version.revision].join('.');
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
                Cache.User.set(response);
                Tokens.setCurrentName(response.nickname || response.name);
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
