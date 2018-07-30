'use strict';

const Mn         = require('backbone.marionette');
const template   = require('./empty.ejs');
const HostModel  = require('../../models/host');
const Controller = require('../controller');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        proxy:       'button.proxy',
        redirection: 'button.redirection',
        '404':       'button.404'
    },

    events: {
        'click @ui.proxy': function (e) {
            e.preventDefault();
            Controller.showProxyHostForm(new HostModel.Model);
        },

        'click @ui.redirection': function (e) {
            e.preventDefault();
            Controller.showRedirectionHostForm(new HostModel.Model);
        },

        'click @ui.404': function (e) {
            e.preventDefault();
            Controller.show404HostForm(new HostModel.Model);
        }
    }
});
