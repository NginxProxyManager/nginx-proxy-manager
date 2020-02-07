const Mn            = require('backbone.marionette');
const App           = require('../../main');
const DeadHostModel = require('../../../models/dead-host');
const ListView      = require('./list/main');
const ErrorView     = require('../../error/main');
const EmptyView     = require('../../empty/main');
const template      = require('./main.ejs');

module.exports = Mn.View.extend({
    id:       'nginx-dead',
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
            App.Controller.showNginxDeadForm();
        },

        'click @ui.help': function (e) {
            e.preventDefault();
            App.Controller.showHelp(App.i18n('dead-hosts', 'help-title'), App.i18n('dead-hosts', 'help-content'));
        }
    },

    templateContext: {
        showAddButton: App.Cache.User.canManage('dead_hosts')
    },

    onRender: function () {
        let view = this;

        App.Api.Nginx.DeadHosts.getAll(['owner', 'certificate'])
            .then(response => {
                if (!view.isDestroyed()) {
                    if (response && response.length) {
                        view.showChildView('list_region', new ListView({
                            collection: new DeadHostModel.Collection(response)
                        }));
                    } else {
                        let manage = App.Cache.User.canManage('dead_hosts');

                        view.showChildView('list_region', new EmptyView({
                            title:      App.i18n('dead-hosts', 'empty'),
                            subtitle:   App.i18n('all-hosts', 'empty-subtitle', {manage: manage}),
                            link:       manage ? App.i18n('dead-hosts', 'add') : null,
                            btn_color:  'danger',
                            permission: 'dead_hosts',
                            action:     function () {
                                App.Controller.showNginxDeadForm();
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
                        App.Controller.showNginxDead();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
