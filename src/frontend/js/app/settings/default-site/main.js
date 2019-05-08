const Mn       = require('backbone.marionette');
const App      = require('../../main');
const template = require('./main.ejs');

require('jquery-serializejson');
require('selectize');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:     'form',
        buttons:  '.modal-footer button',
        cancel:   'button.cancel',
        save:     'button.save',
        options:  '.option-item',
        value:    'input[name="value"]',
        redirect: '.redirect-input',
        html:     '.html-content'
    },

    events: {
        'change @ui.value': function (e) {
            let val = this.ui.value.filter(':checked').val();
            this.ui.options.hide();
            this.ui.options.filter('.option-' + val).show();
        },

        'click @ui.save': function (e) {
            e.preventDefault();

            let val = this.ui.value.filter(':checked').val();

            // Clear redirect field before validation
            if (val !== 'redirect') {
                this.ui.redirect.val('').attr('required', false);
            } else {
                this.ui.redirect.attr('required', true);
            }

            this.ui.html.attr('required', val === 'html');

            if (!this.ui.form[0].checkValidity()) {
                $('<input type="submit">').hide().appendTo(this.ui.form).click().remove();
                return;
            }

            let view = this;
            let data = this.ui.form.serializeJSON();
            data.id  = this.model.get('id');

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            App.Api.Settings.update(data)
                .then(result => {
                    view.model.set(result);
                    App.UI.closeModal();
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    onRender: function () {
        this.ui.value.trigger('change');
    }
});
