const Mn              = require('backbone.marionette');
const App             = require('../../main');
const AccessListModel = require('../../../models/access-list');
const ListView        = require('./list/main');
const ErrorView       = require('../../error/main');
const EmptyView       = require('../../empty/main');
const template        = require('./main.ejs');

module.exports = Mn.View.extend({
    id:       'nginx-access',
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
            App.Controller.showNginxAccessListForm();
        },

        'click @ui.help': function (e) {
            e.preventDefault();
            App.Controller.showHelp(App.i18n('access-lists', 'help-title'), App.i18n('access-lists', 'help-content'));
        }
    },

    templateContext: {
        showAddButton: App.Cache.User.canManage('access_lists')
    },

    onRender: function () {
        let view = this;

        App.Api.Nginx.AccessLists.getAll(['owner', 'items'])
            .then(response => {
                if (!view.isDestroyed()) {
                    if (response && response.length) {
                        view.showChildView('list_region', new ListView({
                            collection: new AccessListModel.Collection(response)
                        }));
                    } else {
                        let manage = App.Cache.User.canManage('access_lists');

                        view.showChildView('list_region', new EmptyView({
                            title:      App.i18n('access-lists', 'empty'),
                            subtitle:   App.i18n('all-hosts', 'empty-subtitle', {manage: manage}),
                            link:       manage ? App.i18n('access-lists', 'add') : null,
                            btn_color:  'teal',
                            permission: 'access_lists',
                            action:     function () {
                                App.Controller.showNginxAccessListForm();
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
                        App.Controller.showNginxAccess();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
