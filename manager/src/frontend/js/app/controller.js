'use strict';

import Backbone from 'backbone';

const Cache = require('./cache');

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
     * Dashboard
     */
    showDashboard: function () {
        require(['./main', './dashboard/main'], (App, View) => {
            this.navigate('/');
            App.UI.showMainLoading();

            let view = new View();

            view.on('loaded', function () {
                App.UI.hideMainLoading();
            });

            App.UI.showChildView('main_region', view);
        });
    },

    /**
     * Access
     */
    showAccess: function () {
        require(['./main', './access/main'], (App, View) => {
            this.navigate('/access');
            App.UI.showMainLoading();

            let view = new View();

            view.on('loaded', function () {
                App.UI.hideMainLoading();
            });

            App.UI.showChildView('main_region', view);
        });
    },

    /**
     * Show Proxy Host Form
     *
     * @param model
     */
    showProxyHostForm: function (model) {
        require(['./main', './host/proxy_form'], function (App, View) {
            App.UI.showModalDialog(new View({model: model}));
        });
    },

    /**
     * Show Redirection Host Form
     *
     * @param model
     */
    showRedirectionHostForm: function (model) {
        require(['./main', './host/redirection_form'], function (App, View) {
            App.UI.showModalDialog(new View({model: model}));
        });
    },

    /**
     * Show 404 Host Form
     *
     * @param model
     */
    show404HostForm: function (model) {
        require(['./main', './host/404_form'], function (App, View) {
            App.UI.showModalDialog(new View({model: model}));
        });
    },

    /**
     * Show Stream Host Form
     *
     * @param model
     */
    showStreamHostForm: function (model) {
        require(['./main', './host/stream_form'], function (App, View) {
            App.UI.showModalDialog(new View({model: model}));
        });
    },

    /**
     * Show Delete Host Confirmation
     *
     * @param model
     */
    showDeleteHost: function (model) {
        require(['./main', './host/delete'], function (App, View) {
            App.UI.showModalDialog(new View({model: model}));
        });
    },

    /**
     * Show Reconfigure Host
     *
     * @param model
     */
    showReconfigureHost: function (model) {
        require(['./main', './host/reconfigure'], function (App, View) {
            App.UI.showModalDialog(new View({model: model}));
        });
    },

    /**
     * Show Advanced Host
     *
     * @param model
     */
    showAdvancedHost: function (model) {
        require(['./main', './host/advanced'], function (App, View) {
            App.UI.showModalDialog(new View({model: model}));
        });
    },


    /**
     * Show Access List Form
     *
     * @param model
     */
    showAccessListForm: function (model) {
        require(['./main', './access_list/form'], function (App, View) {
            App.UI.showModalDialog(new View({model: model}));
        });
    },

    /**
     * Show Delete Access List Confirmation
     *
     * @param model
     */
    showDeleteAccessList: function (model) {
        require(['./main', './access_list/delete'], function (App, View) {
            App.UI.showModalDialog(new View({model: model}));
        });
    },

    /**
     * Error
     *
     * @param {Error}   err
     * @param {String}  nice_msg
     */
    showError: function (err, nice_msg) {
        require(['./main', './error/main'], (App, View) => {
            App.UI.showChildView('main_region', new View({
                err:      err,
                nice_msg: nice_msg
            }));
        });
    }
};
