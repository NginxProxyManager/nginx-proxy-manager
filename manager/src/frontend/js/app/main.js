'use strict';

const $          = require('jquery');
const _          = require('underscore');
const Backbone   = require('backbone');
const Mn         = require('../lib/marionette');
const Cache      = require('./cache');
const Controller = require('./controller');
const Router     = require('./router');
const UI         = require('./ui/main');
const Api        = require('./api');

const App = Mn.Application.extend({

    region:     '#app',
    Cache:      Cache,
    Api:        Api,
    UI:         null,
    Controller: Controller,
    version:    null,

    onStart: function (app, options) {
        console.log('Welcome to Nginx Proxy Manager');

        let myapp = this;

        Api.status()
            .then(result => {
                this.version = [result.version.major, result.version.minor, result.version.revision].join('.');
            })
            .then(Api.Bootstrap)
            .then(() => {
                this.bootstrapTimer();

                this.UI = new UI();
                this.UI.on('render', () => {
                    // If successful, start the history and routing
                    new Router(options);
                    Backbone.history.start({});

                    // Remove loading class
                    $('#app').removeClass('loading');
                });

                this.getRegion().show(this.UI);
            })
            .catch(function (err) {
                console.info('Not logged in: ', err.message);
                myapp.trigger('after:start');
                myapp.UI = new UI();
                myapp.UI.on('render', () => {
                    // Remove loading class
                    myapp.UI.reset();
                    Controller.showLogin();
                });
                myapp.getRegion().show(myapp.UI);
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
        let temp     = Error.call(this, message);
        temp.name    = this.name = 'AppError';
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
                .then(Api.Bootstrap)
                .then(() => {
                    this.bootstrapTimer();
                })
                .catch(err => {
                    if (err.message !== 'timeout' && err.code && err.code !== 400) {
                        console.log(err);
                        console.error(err.message);
                        document.location.reload();
                    } else {
                        this.bootstrapTimer();
                    }
                });
        }, 30 * 1000);
    }
});

const app = new App();
module.exports = app;
