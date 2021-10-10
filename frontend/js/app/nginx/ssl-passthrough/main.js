const Mn                  = require('backbone.marionette');
const App                 = require('../../main');
const SslPassthroughModel = require('../../../models/ssl-passthrough-host');
const ListView            = require('./list/main');
const ErrorView           = require('../../error/main');
const EmptyView           = require('../../empty/main');
const template            = require('./main.ejs');

module.exports = Mn.View.extend({
    id:       'nginx-ssl-passthrough',
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
            App.Controller.showNginxSslPassthroughForm();
        },

        'click @ui.help': function (e) {
            e.preventDefault();
            App.Controller.showHelp(App.i18n('ssl-passthrough-hosts', 'help-title'), App.i18n('ssl-passthrough-hosts', 'help-content'));
        }
    },

    templateContext: {
        showAddButton: App.Cache.User.canManage('ssl_passthrough_hosts')
    },

    onRender: function () {
        let view = this;

        App.Api.Nginx.SslPassthroughHosts.getAll(['owner'])
            .then(response => {
                if (!view.isDestroyed()) {
                    if (response && response.length) {
                        view.showChildView('list_region', new ListView({
                            collection: new SslPassthroughModel.Collection(response)
                        }));
                    } else {
                        let manage = App.Cache.User.canManage('ssl_passthrough_hosts');

                        view.showChildView('list_region', new EmptyView({
                            title:      App.i18n('ssl-passthrough-hosts', 'empty'),
                            subtitle:   App.i18n('all-hosts', 'empty-subtitle', {manage: manage}),
                            link:       manage ? App.i18n('ssl_passthrough_hosts', 'add') : null,
                            btn_color:  'blue',
                            permission: 'ssl-passthrough-hosts',
                            action:     function () {
                                App.Controller.showNginxSslPassthroughForm();
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
                        App.Controller.showNginxSslPassthrough();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
