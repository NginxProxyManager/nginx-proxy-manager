const Mn            = require('backbone.marionette');
const App           = require('../main');
const AuditLogModel = require('../../models/audit-log');
const ListView      = require('./list/main');
const template      = require('./main.ejs');
const ErrorView     = require('../error/main');
const EmptyView     = require('../empty/main');

module.exports = Mn.View.extend({
    id:       'audit-log',
    template: template,

    ui: {
        list_region: '.list-region',
        dimmer:      '.dimmer',
        search:      '.search-form',
        query:       'input[name="source-query"]'
    },

    fetch: App.Api.AuditLog.getAll,

    showData: function(response) {
        this.showChildView('list_region', new ListView({
            collection: new AuditLogModel.Collection(response)
        }));
    },

    showError: function(err) {
        this.showChildView('list_region', new ErrorView({
            code:    err.code,
            message: err.message,
            retry:   function () {
                App.Controller.showAuditLog();
            }
        }));

        console.error(err);
    },

    showEmpty: function() {
        this.showChildView('list_region', new EmptyView({
            title:    App.i18n('audit-log', 'empty'),
            subtitle: App.i18n('audit-log', 'empty-subtitle')
        }));
    },

    regions: {
        list_region: '@ui.list_region'
    },

    events: {
        'submit @ui.search': function (e) {
            e.preventDefault();
            let query = this.ui.query.val();

            this.fetch(['user'], query)
                .then(response => this.showData(response))
                .catch(err => {
                    this.showError(err);
                });
        }
    },

    onRender: function () {
        let view = this;

        view.fetch(['user'])
            .then(response => {
                if (!view.isDestroyed() && response && response.length) {
                    view.showData(response);
                } else {
                    view.showEmpty();
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
