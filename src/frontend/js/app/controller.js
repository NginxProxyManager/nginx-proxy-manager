'use strict';

const Backbone = require('backbone');
const Cache    = require('./cache');
const Tokens   = require('./tokens');

module.exports = {

    /**
     * @param {String} route
     * @param {Object} [options]
     * @returns {Boolean}
     */
    navigate: function (route, options) {
        options = options || {};
        Backbone.history.navigate(route.toString(), options);
        return true;
    },

    /**
     * Login
     */
    showLogin: function () {
        window.location = '/login';
    },

    /**
     * Users
     */
    showUsers: function () {
        let controller = this;
        if (Cache.User.isAdmin()) {
            require(['./main', './users/main'], (App, View) => {
                controller.navigate('/users');
                App.UI.showAppContent(new View());
            });
        } else {
            this.showDashboard();
        }
    },

    /**
     * User Form
     *
     * @param model
     */
    showUserForm: function (model) {
        if (Cache.User.isAdmin()) {
            require(['./main', './user/form'], function (App, View) {
                App.UI.showModalDialog(new View({model: model}));
            });
        }
    },

    /**
     * Error
     *
     * @param {Error}   err
     * @param {String}  nice_msg
     */
    /*
    showError: function (err, nice_msg) {
        require(['./main', './error/main'], (App, View) => {
            App.UI.showAppContent(new View({
                err:      err,
                nice_msg: nice_msg
            }));
        });
    },
    */

    /**
     * Dashboard
     */
    showDashboard: function () {
        let controller = this;

        require(['./main', './dashboard/main'], (App, View) => {
            controller.navigate('/');
            App.UI.showAppContent(new View());
        });
    },

    /**
     * Dashboard
     */
    showProfile: function () {
        let controller = this;

        require(['./main', './profile/main'], (App, View) => {
            controller.navigate('/profile');
            App.UI.showAppContent(new View());
        });
    },

    /**
     * Logout
     */
    logout: function () {
        Tokens.dropTopToken();
        this.showLogin();
    }
};
