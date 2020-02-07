const Mn       = require('backbone.marionette');
const moment   = require('moment');
const App      = require('../../../main');
const template = require('./item.ejs');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        host_link: '.host-link',
        renew:     'a.renew',
        delete:    'a.delete'
    },

    events: {
        'click @ui.renew': function (e) {
            e.preventDefault();
            App.Controller.showNginxCertificateRenew(this.model);
        },

        'click @ui.delete': function (e) {
            e.preventDefault();
            App.Controller.showNginxCertificateDeleteConfirm(this.model);
        },

        'click @ui.host_link': function (e) {
            e.preventDefault();
            let win = window.open($(e.currentTarget).attr('rel'), '_blank');
            win.focus();
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
