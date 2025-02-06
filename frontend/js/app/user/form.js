const Mn        = require('backbone.marionette');
const App       = require('../main');
const UserModel = require('../../models/user');
const template  = require('./form.ejs');

require('jquery-serializejson');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:    'form',
        buttons: '.modal-footer button',
        cancel:  'button.cancel',
        save:    'button.save',
        error:   '.secret-error',
        mfaError: '.mfa-error',
        addMfa:  '.mfa-add',
        mfaValidation: '.mfa-validation-container',
        qrInstructions: '.qr-instructions',
        removeMfa: '.mfa-remove',
        removeMfaConfirmContainer: '.mfa-remove-confirm-container',
        removeMfaConfirm: '.mfa-remove-confirm',
        removeMfaPassword: '.mfa-remove-password-field'
    },

    events: {

        'submit @ui.form': function (e) {
            e.preventDefault();
            this.ui.error.hide();
            let view = this;
            let data = this.ui.form.serializeJSON();

            // Save "mfa_validation" value and remove it from data
            let mfaToken = data.mfa_validation;
            delete data.mfa_validation;

            let show_password = this.model.get('email') === 'admin@example.com';

            // admin@example.com is not allowed
            if (data.email === 'admin@example.com') {
                this.ui.error.text(App.i18n('users', 'default_error')).show();
                this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                return;
            }

            // Manipulate
            data.roles = [];
            if ((this.model.get('id') === App.Cache.User.get('id') && this.model.isAdmin()) || (typeof data.is_admin !== 'undefined' && data.is_admin)) {
                data.roles.push('admin');
                delete data.is_admin;
            }

            data.is_disabled = typeof data.is_disabled !== 'undefined' ? !!data.is_disabled : false;
            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            let method = App.Api.Users.create;

            if (this.model.get('id')) {
                // edit
                method  = App.Api.Users.update;
                data.id = this.model.get('id');
            }

            method(data)
                .then(result => {
                    if (result.id === App.Cache.User.get('id')) {
                        App.Cache.User.set(result);
                    }

                    if (view.model.get('id') !== App.Cache.User.get('id')) {
                        App.Controller.showUsers();
                    }

                    view.model.set(result);

                    if (mfaToken) {
                        return App.Api.Mfa.enable(mfaToken)
                            .then(() => result);
                    }
                    return result;
                })
                .then(result => {
                    App.UI.closeModal(function () {
                        if (method === App.Api.Users.create) {
                            // Show permissions dialog immediately
                            App.Controller.showUserPermissions(view.model);
                        } else if (show_password) {
                            App.Controller.showUserPasswordForm(view.model);
                        }
                    });
                })
                .catch(err => {
                    this.ui.error.text(err.message).show();
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        },
        'click @ui.addMfa': function (e) {
            let view = this;
            App.Api.Mfa.create()
                .then(response => {
                    view.ui.addMfa.replaceWith(`<img class="qr-code" src="${response.qrCode}" alt="QR Code">`);
                    view.ui.qrInstructions.show();
                    view.ui.mfaValidation.show();
                    // Add required attribute once MFA is activated
                    view.ui.mfaValidation.find('input[name="mfa_validation"]').attr('required', true);
                })
                .catch(err => {
                    view.ui.error.text(err.message).show();
                });
        },
        'click @ui.removeMfa': function (e) {
            // Show confirmation section with a password field and confirm button
            this.ui.removeMfa.hide();
            this.ui.removeMfaConfirmContainer.show();
        },
        'click @ui.removeMfaConfirm': function (e) {
            let view = this;
            let password = view.ui.removeMfaPassword.val();
            if (!password) {
                view.ui.error.text('Password required to remove MFA').show();
                return;
            }
            App.Api.Mfa.delete(password)
                .then(() => {
                    view.ui.addMfa.show();
                    view.ui.qrInstructions.hide();
                    view.ui.mfaValidation.hide();
                    view.ui.removeMfaConfirmContainer.hide();
                    view.ui.removeMfa.hide();
                    view.ui.mfaValidation.find('input[name="mfa_validation"]').removeAttr('required');
                })
                .catch(err => {
                    view.ui.mfaError.text(err.message).show();
                });
        }
    },

    templateContext: function () {
        let view = this;

        return {
            isSelf: function () {
                return view.model.get('id') === App.Cache.User.get('id');
            },

            isAdmin: function () {
                return App.Cache.User.isAdmin();
            },

            isAdminUser: function () {
                return view.model.isAdmin();
            },

            isDisabled: function () {
                return view.model.isDisabled();
            }
        };
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new UserModel.Model();
        }
    },

    onRender: function () {
        let view = this;
        App.Api.Mfa.check()
            .then(response => {
                if (response.active) {
                    view.ui.addMfa.hide();
                    view.ui.qrInstructions.hide();
                    view.ui.mfaValidation.hide();
                    view.ui.removeMfa.show();
                    view.ui.removeMfaConfirmContainer.hide();
                    view.ui.mfaValidation.find('input[name="mfa_validation"]').removeAttr('required');
                } else {
                    view.ui.addMfa.show();
                    view.ui.qrInstructions.hide();
                    view.ui.mfaValidation.hide();
                    view.ui.removeMfa.hide();
                    view.ui.removeMfaConfirmContainer.hide();
                    view.ui.mfaValidation.find('input[name="mfa_validation"]').removeAttr('required');
                }
            })
            .catch(err => {
                view.ui.error.text(err.message).show();
            });
    }
});
