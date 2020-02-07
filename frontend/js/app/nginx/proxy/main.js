const Mn             = require('backbone.marionette');
const App            = require('../../main');
const ProxyHostModel = require('../../../models/proxy-host');
const ListView       = require('./list/main');
const ErrorView      = require('../../error/main');
const EmptyView      = require('../../empty/main');
const template       = require('./main.ejs');

module.exports = Mn.View.extend({
    id:       'nginx-proxy',
    template: template,

    ui: {
        list_region: '.list-region',
        add:         '.add-item',
        help:        '.help',
        dimmer:      '.dimmer'
    },

    regions: {
        list_region: '@ui.list_region'
    },

    events: {
        'click @ui.add': function (e) {
            e.preventDefault();
            App.Controller.showNginxProxyForm();
        },

        'click @ui.help': function (e) {
            e.preventDefault();
            App.Controller.showHelp(App.i18n('proxy-hosts', 'help-title'), App.i18n('proxy-hosts', 'help-content'));
        }
    },

    templateContext: {
        showAddButton: App.Cache.User.canManage('proxy_hosts')
    },

    onRender: function () {
        let view = this;

        App.Api.Nginx.ProxyHosts.getAll(['owner', 'access_list', 'certificate'])
            .then(response => {
                if (!view.isDestroyed()) {
                    if (response && response.length) {
                        view.showChildView('list_region', new ListView({
                            collection: new ProxyHostModel.Collection(response)
                        }));
                    } else {
                        let manage = App.Cache.User.canManage('proxy_hosts');

                        view.showChildView('list_region', new EmptyView({
                            title:      App.i18n('proxy-hosts', 'empty'),
                            subtitle:   App.i18n('all-hosts', 'empty-subtitle', {manage: manage}),
                            link:       manage ? App.i18n('proxy-hosts', 'add') : null,
                            btn_color:  'success',
                            permission: 'proxy_hosts',
                            action:     function () {
                                App.Controller.showNginxProxyForm();
                            }
                        }));
                    }
                }
            })
            .catch(err => {
                view.showChildView('list_region', new ErrorView({
                    code:    err.code,
                    message: err.message,
                    retry:   function () {
                        App.Controller.showNginxProxy();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
