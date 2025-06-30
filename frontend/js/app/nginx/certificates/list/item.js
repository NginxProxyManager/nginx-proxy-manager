const Mn            = require('backbone.marionette');
const moment        = require('moment');
const App           = require('../../../main');
const template      = require('./item.ejs');
const dns_providers = require('../../../../../../global/certbot-dns-plugins');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        host_link: '.host-link',
        renew:     'a.renew',
        delete:    'a.delete',
        download:  'a.download',
        test:      'a.test'
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
        },
                
        'click @ui.download': function (e) {
            e.preventDefault();
            App.Api.Nginx.Certificates.download(this.model.get('id'));
        },

        'click @ui.test': function (e) {
            e.preventDefault();
            App.Controller.showNginxCertificateTestReachability(this.model);
        },
    },

    templateContext: function () {
        return {
            canManage: App.Cache.User.canManage('certificates'),
            isExpired: function () {
                return moment(this.expires_on).isBefore(moment());
            },
            dns_providers: dns_providers,
            active_domain_names: function () {
                const { proxy_hosts = [], redirect_hosts = [], dead_hosts = [] } = this;
                return [...proxy_hosts, ...redirect_hosts, ...dead_hosts].reduce((acc, host) => {
                    acc.push(...(host.domain_names || []));
                    return acc;
                }, []);
            }
        };
    },


    initialize: function () {
        this.listenTo(this.model, 'change', this.render);
    }
});
