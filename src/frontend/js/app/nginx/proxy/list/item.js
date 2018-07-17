'use strict';

const Mn         = require('backbone.marionette');
const Controller = require('../../../controller');
const Api        = require('../../../api');
const Cache      = require('../../../cache');
const template   = require('./item.ejs');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        edit:   'a.edit',
        delete: 'a.delete'
    },

    events: {
        'click @ui.edit': function (e) {
            e.preventDefault();
            Controller.showNginxProxyForm(this.model);
        },

        'click @ui.delete': function (e) {
            e.preventDefault();
            Controller.showNginxProxyDeleteConfirm(this.model);
        }
    },

    templateContext: {
        canManage: Cache.User.canManage('proxy_hosts')
    },

    initialize: function () {
        this.listenTo(this.model, 'change', this.render);
    }
});
