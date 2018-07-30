'use strict';

const Mn              = require('backbone.marionette');
const template        = require('./row.ejs');
const Controller      = require('../controller');
const AccessListModel = require('../../models/access');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        edit:        'button.edit',
        delete:      'button.delete',
        access_list: 'a.access_list',
        reconfigure: 'button.reconfigure',
        advanced:    'button.advanced'
    },

    events: {
        'click @ui.edit': function (e) {
            e.preventDefault();
            switch (this.model.get('type')) {
                case 'proxy':
                    Controller.showProxyHostForm(this.model);
                    break;
                case 'redirection':
                    Controller.showRedirectionHostForm(this.model);
                    break;
                case '404':
                    Controller.show404HostForm(this.model);
                    break;
                case 'stream':
                    Controller.showStreamHostForm(this.model);
                    break;
            }
        },

        'click @ui.delete': function (e) {
            e.preventDefault();
            Controller.showDeleteHost(this.model);
        },

        'click @ui.access_list': function (e) {
            e.preventDefault();
            Controller.showAccessListForm(new AccessListModel.Model(this.model.get('access_list')));
        },

        'click @ui.reconfigure': function (e) {
            e.preventDefault();
            Controller.showReconfigureHost(this.model);
        },

        'click @ui.advanced': function (e) {
            e.preventDefault();
            Controller.showAdvancedHost(this.model);
        }
    },

    initialize: function () {
        this.listenTo(this.model, 'change', this.render);
    }
});
