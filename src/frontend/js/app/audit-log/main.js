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
        dimmer:      '.dimmer'
    },

    regions: {
        list_region: '@ui.list_region'
    },

    onRender: function () {
        let view = this;

        App.Api.AuditLog.getAll(['user'])
            .then(response => {
                if (!view.isDestroyed() && response && response.length) {
                    view.showChildView('list_region', new ListView({
                        collection: new AuditLogModel.Collection(response)
                    }));
                } else {
                    view.showChildView('list_region', new EmptyView({
                        title:    App.i18n('audit-log', 'empty'),
                        subtitle: App.i18n('audit-log', 'empty-subtitle')
                    }));
                }
            })
            .catch(err => {
                view.showChildView('list_region', new ErrorView({
                    code:    err.code,
                    message: err.message,
                    retry:   function () {
                        App.Controller.showAuditLog();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
