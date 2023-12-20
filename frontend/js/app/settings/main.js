const Mn           = require('backbone.marionette');
const App          = require('../main');
const SettingModel = require('../../models/setting');
const ListView     = require('./list/main');
const ErrorView    = require('../error/main');
const template     = require('./main.ejs');

require('jquery-serializejson');

module.exports = Mn.View.extend({
    id:       'settings',
    template: template,

    ui: {
        local_policy_field: '#open-appsec form #local_policy',
        lp_success_info:    '#open-appsec form #lp_success_info',
        lp_error_info:      '#open-appsec form #lp_error_info',
        form:               '#open-appsec form',
        save:               'button.save',
        list_region: '.list-region',
        add:         '.add-item',
        dimmer:      '.dimmer'
    },

    regions: {
        list_region: '@ui.list_region'
    },

    events: {
        'click @ui.save': function (e) {
            e.preventDefault();
            
            this.ui.lp_success_info.hide();
            this.ui.lp_error_info.hide();

            let data = this.ui.form.serializeJSON();
            console.log(data);
            App.Api.OpenAppsecSettings.save(data)
                .then(response => {
                    this.showSuccess();
                })
                .catch(err => {
                    console.error(err);
                    this.showError(err);
                });
        }
    },

    showSuccess: function () {
        this.ui.lp_success_info.show();
        setTimeout(() => {
            this.ui.lp_success_info.fadeOut();
        }, 1000); 
    },

    showError: function (err) {
        this.ui.lp_error_info.show();
        this.ui.lp_error_info.html(err.message);
        setTimeout(() => {
            this.ui.lp_error_info.fadeOut();
        }, 3000);
    },

    onRender: function () {
        let view = this;

        this.ui.lp_success_info.hide();
        this.ui.lp_error_info.hide();

        App.Api.OpenAppsecSettings.get()
            .then(response => {
                if (!view.isDestroyed() && response) {
                    view.ui.local_policy_field.val(response);
                }
            })
            .catch(err => {
                console.error(err);
            });

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
