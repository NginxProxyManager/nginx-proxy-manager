const Mn                   = require('backbone.marionette');
const App                  = require('../../main');
const RedirectionHostModel = require('../../../models/redirection-host');
const ListView             = require('./list/main');
const ErrorView            = require('../../error/main');
const EmptyView            = require('../../empty/main');
const template             = require('./main.ejs');

module.exports = Mn.View.extend({
    id:       'nginx-redirection',
    template: template,

    ui: {
        list_region: '.list-region',
        add:         '.add-item',
        help:        '.help',
        dimmer:      '.dimmer',
        search:      '.search-form',
        query:       'input[name="source-query"]'
    },

    fetch: App.Api.Nginx.RedirectionHosts.getAll,

    showData: function(response) {
        this.showChildView('list_region', new ListView({
            collection: new RedirectionHostModel.Collection(response)
        }));
    },

    showError: function(err) {
        this.showChildView('list_region', new ErrorView({
            code:    err.code,
            message: err.message,
            retry:   function () {
                App.Controller.showNginxRedirection();
            }
        }));
        console.error(err);
    },

    showEmpty: function() {
        let manage = App.Cache.User.canManage('redirection_hosts');

        this.showChildView('list_region', new EmptyView({
            title:      App.i18n('redirection-hosts', 'empty'),
            subtitle:   App.i18n('all-hosts', 'empty-subtitle', {manage: manage}),
            links:       manage ? [App.i18n('redirection-hosts', 'add')] : [],
            btn_color:  'yellow',
            permission: 'redirection_hosts',
            actions:     [
                function () {
                    App.Controller.showNginxRedirectionForm();
                }
            ]
        }));
    },

    regions: {
        list_region: '@ui.list_region'
    },

    events: {
        'click @ui.add': function (e) {
            e.preventDefault();
            App.Controller.showNginxRedirectionForm();
        },

        'click @ui.help': function (e) {
            e.preventDefault();
            App.Controller.showHelp(App.i18n('redirection-hosts', 'help-title'), App.i18n('redirection-hosts', 'help-content'));
        },

        'submit @ui.search': function (e) {
            e.preventDefault();
            let query = this.ui.query.val();

            this.fetch(['owner', 'certificate'], query)
                .then(response => this.showData(response))
                .catch(err => {
                    this.showError(err);
                });
        }
    },

    templateContext: {
        showAddButton: App.Cache.User.canManage('proxy_hosts')
    },

    onRender: function () {
        let view = this;

        view.fetch(['owner', 'certificate'])
            .then(response => {
                if (!view.isDestroyed()) {
                    if (response && response.length) {
                        view.showData(response);
                    } else {
                        view.showEmpty();
                    }
                }
            })
            .catch(err => {
                view.showError(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
