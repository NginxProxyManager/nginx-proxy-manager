const $        = require('jquery');
const Mn       = require('backbone.marionette');
const template = require('./login.ejs');
const Api      = require('../../app/api');
const i18n     = require('../../app/i18n');

module.exports = Mn.View.extend({
    template:  template,
    className: 'page-single',

    ui: {
        form:     'form',
        identity: 'input[name="identity"]',
        secret:   'input[name="secret"]',
        error:    '.secret-error',
        error_mfa:'.mfa-error',
        button:   'button',
        mfaGroup: '.mfa-group',    // added MFA group selector
        mfaToken: 'input[name="mfa_token"]', // added MFA token input
        mfaInfo:  '.mfa-info' // added MFA info element
    },

    events: {
        'submit @ui.form': function (e) {
            e.preventDefault();
            this.ui.button.addClass('btn-loading').prop('disabled', true);
            this.ui.error.hide();

            if(this.ui.mfaToken.val()) {
                Api.Tokens.loginWithMFA(this.ui.identity.val(), this.ui.secret.val(), this.ui.mfaToken.val(), true)
                .then(() => {
                    window.location = '/';
                })
                .catch(err => {
                    if (err.message === 'Invalid MFA token.') {
                        this.ui.error_mfa.text(err.message).show();
                    } else {
                        this.ui.error.text(err.message).show();
                    }
                    this.ui.button.removeClass('btn-loading').prop('disabled', false);
                });
            } else {
                Api.Tokens.login(this.ui.identity.val(), this.ui.secret.val(), true)
                .then(() => {
                    window.location = '/';
                })
                .catch(err => {
                    if (err.message === 'MFA token required') {
                        this.ui.mfaGroup.show();
                        this.ui.mfaInfo.show();
                    } else {
                        this.ui.error.text(err.message).show();
                    }
                    this.ui.button.removeClass('btn-loading').prop('disabled', false);
                });
            }

            
        }
    },

    templateContext: {
        i18n:       i18n,
        getVersion: function () {
            return $('#login').data('version');
        }
    }
});


