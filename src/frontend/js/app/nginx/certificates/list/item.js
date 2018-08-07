'use strict';

const Mn       = require('backbone.marionette');
const moment   = require('moment');
const App      = require('../../../main');
const template = require('./item.ejs');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        delete: 'a.delete'
    },

    events: {
        'click @ui.delete': function (e) {
            e.preventDefault();
            App.Controller.showNginxCertificateDeleteConfirm(this.model);
        }
    },

    templateContext: {
        canManage: App.Cache.User.canManage('certificates'),
        isExpired: function () {
            return moment(this.expires_on).isBefore(moment());
        }
    },

    initialize: function () {
        this.listenTo(this.model, 'change', this.render);
    }
});
