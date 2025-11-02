const Mn       = require('backbone.marionette');
const App      = require('../../main');
const template = require('./main.ejs');

require('jquery-serializejson');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog wide',

    ui: {
        form:    'form',
        buttons: '.modal-footer button',
        cancel:  'button.cancel',
        save:    'button.save',
    },

    events: {
        'click @ui.save': function (e) {
            e.preventDefault();

            if (!this.ui.form[0].checkValidity()) {
                $('<input type="submit">').hide().appendTo(this.ui.form).click().remove();
                return;
            }

            let view = this;
            let data = this.ui.form.serializeJSON();
            data.id  = this.model.get('id');
            if (data.meta.enabled) {
                data.meta.enabled = data.meta.enabled === 'on' || data.meta.enabled === 'true';
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            App.Api.Settings.update(data)
                .then((result) => {
                    view.model.set(result);
                    App.UI.closeModal();
                })
                .catch((err) => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    }
});
