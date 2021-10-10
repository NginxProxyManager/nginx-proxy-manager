const Mn                  = require('backbone.marionette');
const App                 = require('../../main');
const SslPassthroughModel = require('../../../models/ssl-passthrough-host');
const template            = require('./form.ejs');

require('jquery-serializejson');
require('jquery-mask-plugin');
require('selectize');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:       'form',
        forwarding_host: 'input[name="forwarding_host"]',
        buttons:    '.modal-footer button',
        cancel:     'button.cancel',
        save:       'button.save'
    },

    events: {
        'change @ui.switches': function () {
            this.ui.type_error.hide();
        },

        'click @ui.save': function (e) {
            e.preventDefault();

            if (!this.ui.form[0].checkValidity()) {
                $('<input type="submit">').hide().appendTo(this.ui.form).click().remove();
                return;
            }

            let view = this;
            let data = this.ui.form.serializeJSON();

            // Manipulate
            data.forwarding_port = parseInt(data.forwarding_port, 10);

            let method = App.Api.Nginx.SslPassthroughHosts.create;
            let is_new = true;

            if (this.model.get('id')) {
                // edit
                is_new  = false;
                method  = App.Api.Nginx.SslPassthroughHosts.update;
                data.id = this.model.get('id');
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            method(data)
                .then(result => {
                    view.model.set(result);

                    App.UI.closeModal(function () {
                        if (is_new) {
                            App.Controller.showNginxSslPassthrough();
                        }
                    });
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new SslPassthroughModel.Model();
        }
    }
});
