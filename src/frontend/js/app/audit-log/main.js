'use strict';

const Mn            = require('backbone.marionette');
const AuditLogModel = require('../../models/audit-log');
const Api           = require('../api');
const Controller    = require('../controller');
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

        Api.AuditLog.getAll()
            .then(response => {
                if (!view.isDestroyed() && response && response.length) {
                    view.showChildView('list_region', new ListView({
                        collection: new AuditLogModel.Collection(response)
                    }));
                } else {
                    view.showChildView('list_region', new EmptyView({
                        title:    'There are no logs.',
                        subtitle: 'As soon as you or another user changes something, history of those events will show up here.'
                    }));
                }
            })
            .catch(err => {
                view.showChildView('list_region', new ErrorView({
                    code:    err.code,
                    message: err.message,
                    retry:   function () {
                        Controller.showAuditLog();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
