const Mn           = require('backbone.marionette');
const App          = require('../main');
const SettingModel = require('../../models/setting');
const ListView     = require('./list/main');
const ErrorView    = require('../error/main');
const template     = require('./main.ejs');

module.exports = Mn.View.extend({
    id:       'settings',
    template: template,

    ui: {
        list_region: '.list-region',
        add:         '.add-item',
        dimmer:      '.dimmer'
    },

    regions: {
        list_region: '@ui.list_region'
    },

    onRender: function () {
        let view = this;

        App.Api.Settings.getAll()
            .then(response => {
                if (!view.isDestroyed() && response && response.length) {
                    view.showChildView('list_region', new ListView({
                        collection: new SettingModel.Collection(response)
                    }));
                }
            })
            .catch(err => {
                view.showChildView('list_region', new ErrorView({
                    code:    err.code,
                    message: err.message,
                    retry:   function () {
                        App.Controller.showSettings();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
