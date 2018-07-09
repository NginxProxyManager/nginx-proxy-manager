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
     * User Permissions Form
     *
     * @param model
     */
    showUserPermissions: function (model) {
        if (Cache.User.isAdmin()) {
            require(['./main', './user/permissions'], function (App, View) {
                App.UI.showModalDialog(new View({model: model}));
            });
        }
    },

    /**
     * User Password Form
     *
     * @param model
     */
    showUserPasswordForm: function (model) {
        if (Cache.User.isAdmin() || model.get('id') === Cache.User.get('id')) {
            require(['./main', './user/password'], function (App, View) {
                App.UI.showModalDialog(new View({model: model}));
            });
        }
    },

    /**
     * User Delete Confirm
     *
     * @param model
     */
    showUserDeleteConfirm: function (model) {
        if (Cache.User.isAdmin() && model.get('id') !== Cache.User.get('id')) {
            require(['./main', './user/delete'], function (App, View) {
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
     * Nginx Proxy Hosts
     */
    showNginxProxy: function () {
        if (Cache.User.isAdmin() || Cache.User.canView('proxy_hosts')) {
            let controller = this;

            require(['./main', './nginx/proxy/main'], (App, View) => {
                controller.navigate('/nginx/proxy');
                App.UI.showAppContent(new View());
            });
        }
    },

    /**
     * Nginx Redirection Hosts
     */
    showNginxRedirection: function () {
        if (Cache.User.isAdmin() || Cache.User.canView('redirection_hosts')) {
            let controller = this;

            require(['./main', './nginx/redirection/main'], (App, View) => {
                controller.navigate('/nginx/redirection');
                App.UI.showAppContent(new View());
            });
        }
    },

    /**
     * Nginx Stream Hosts
     */
    showNginxStream: function () {
        if (Cache.User.isAdmin() || Cache.User.canView('streams')) {
            let controller = this;

            require(['./main', './nginx/stream/main'], (App, View) => {
                controller.navigate('/nginx/stream');
                App.UI.showAppContent(new View());
            });
        }
    },

    /**
     * Nginx Dead Hosts
     */
    showNginxDead: function () {
        if (Cache.User.isAdmin() || Cache.User.canView('dead_hosts')) {
            let controller = this;

            require(['./main', './nginx/dead/main'], (App, View) => {
                controller.navigate('/nginx/404');
                App.UI.showAppContent(new View());
            });
        }
    },

    /**
     * Nginx Access
     */
    showNginxAccess: function () {
        if (Cache.User.isAdmin() || Cache.User.canView('access_lists')) {
            let controller = this;

            require(['./main', './nginx/access/main'], (App, View) => {
                controller.navigate('/nginx/access');
                App.UI.showAppContent(new View());
            });
        }
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
