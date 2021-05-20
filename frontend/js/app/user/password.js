const Mn       = require('backbone.marionette');
const App      = require('../main');
const template = require('./password.ejs');

require('jquery-serializejson');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:           'form',
        buttons:        '.modal-footer button',
        cancel:         'button.cancel',
        save:           'button.save',
        newSecretError: '.new-secret-error',
        generalError:   '#error-info',
    },

    events: {
        'click @ui.save': function (e) {
            e.preventDefault();
            this.ui.newSecretError.hide();
            this.ui.generalError.hide();
            let form = this.ui.form.serializeJSON();

            if (form.new_password1 !== form.new_password2) {
                this.ui.newSecretError.text('Passwords do not match!').show();
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
                    // Change error message to make it a little clearer
                    if (err.message === 'Invalid password') {
                        err.message = 'Current password is invalid';
                    }
                    this.ui.generalError.text(err.message).show();
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
    },

    onRender: function () {
        this.ui.newSecretError.hide();
        this.ui.generalError.hide();
    },
});
