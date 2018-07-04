'use strict';

const _          = require('underscore');
const Backbone   = require('backbone');
const Mn         = require('../lib/marionette');
const Cache      = require('./cache');
const Controller = require('./controller');
const Router     = require('./router');
const Api        = require('./api');
const Tokens     = require('./tokens');
const UI         = require('./ui/main');

const App = Mn.Application.extend({

    Cache:      Cache,
    Api:        Api,
    UI:         null,
    Controller: Controller,
    version:    null,

    region: {
        el:             '#app',
        replaceElement: true
    },

    onStart: function (app, options) {
        console.log('Welcome to Nginx Proxy Manager');

        // Check if token is coming through
        if (this.getParam('token')) {
            Tokens.addToken(this.getParam('token'));
        }

        // Check if we are still logged in by refreshing the token
        Api.status()
            .then(result => {
                this.version = [result.version.major, result.version.minor, result.version.revision].join('.');
            })
            .then(Api.Tokens.refresh)
            .then(this.bootstrap)
            .then(() => {
                console.info('You are logged in');
                this.bootstrapTimer();
                this.refreshTokenTimer();

                this.UI = new UI();
                this.UI.on('render', () => {
                    new Router(options);
                    Backbone.history.start({pushState: true});
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

    Error: function (code, message, debug) {
        let temp  = Error.call(this, message);
        temp.name = this.name = 'AppError';
        this.stack   = temp.stack;
        this.message = temp.message;
        this.code    = code;
        this.debug   = debug;
    },

    showError: function () {
        let ErrorView = Mn.View.extend({
            tagName:  'section',
            id:       'error',
            template: _.template('Error loading stuff. Please reload the app.')
        });

        this.getRegion().show(new ErrorView());
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
                    if (version !== this.version) {
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
