const Mn       = require('backbone.marionette');
const App      = require('../main');
const template = require('./password.ejs');

require('jquery-serializejson');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:    'form',
        buttons: '.modal-footer button',
        cancel:  'button.cancel',
        save:    'button.save',
        error:   '.secret-error'
    },

    events: {
        'click @ui.save': function (e) {
            e.preventDefault();
            this.ui.error.hide();
            let form = this.ui.form.serializeJSON();

            if (form.new_password1 !== form.new_password2) {
                this.ui.error.text('Passwords do not match!').show();
                return;
            }

            let data = {
                type:    'password',
                current: form.current_password,
                secret:  form.new_password1
            };

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            App.Api.Users.setPassword(this.model.get('id'), data)
                .then(() => {
                    App.UI.closeModal();
                    App.Controller.showUsers();
                })
                .catch(err => {
                    this.ui.error.text(err.message).show();
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    isSelf: function () {
        return App.Cache.User.get('id') === this.model.get('id');
    },

    templateContext: function () {
        return {
            isSelf: this.isSelf.bind(this)
        };
    }
});
