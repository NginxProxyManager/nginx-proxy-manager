const $        = require('jquery');
const Mn       = require('backbone.marionette');
const template = require('./login.ejs');
const Api      = require('../../app/api');
const i18n     = require('../../app/i18n');
const Tokens   = require('../../app/tokens');

module.exports = Mn.View.extend({
    template:  template,
    className: 'page-single',

    ui: {
        form:         'form',
        identity:     'input[name="identity"]',
        secret:       'input[name="secret"]',
        error:        '.secret-error',
        button:       'button[type=submit]',
        oidcLogin:    'div.login-oidc',
        oidcButton:   'button#login-oidc',
        oidcError:    '.oidc-error',
        oidcProvider: 'span.oidc-provider'
    },

    events: {
        'submit @ui.form': function (e) {
            e.preventDefault();
            this.ui.button.addClass('btn-loading').prop('disabled', true);
            this.ui.error.hide();

            Api.Tokens.login(this.ui.identity.val(), this.ui.secret.val(), true)
                .then(() => {
                    window.location = '/';
                })
                .catch((err) => {
                    this.ui.error.text(err.message).show();
                    this.ui.button.removeClass('btn-loading').prop('disabled', false);
                });
        },
        'click @ui.oidcButton': function() {
            this.ui.identity.prop('disabled', true);
            this.ui.secret.prop('disabled', true);
            this.ui.button.prop('disabled', true);
            this.ui.oidcButton.addClass('btn-loading').prop('disabled', true);
            // redirect to initiate oauth flow
            document.location.replace('/api/oidc/');
        },
    },

    async onRender() {
        // read oauth callback state cookies
        let cookies = document.cookie.split(';'),
            token, expiry, error;
        for (let cookie of cookies) {
            let   raw = cookie.split('='),
                 name = raw[0].trim(),
                value = raw[1];
            if (name === 'npmplus_oidc') {
                let v  = value.split('---');
                token  = v[0];
                expiry = v[1];
            }
            if (name === 'npmplus_oidc_error') {
                error = decodeURIComponent(value);
            }
        }

        // register a newly acquired jwt token following successful oidc authentication
        if (token && expiry && (new Date(Date.parse(decodeURIComponent(expiry)))) > new Date() ) {
            Tokens.addToken(token);
            document.location.replace('/');
        }

        // show error message following a failed oidc authentication
        if (error) {
            this.ui.oidcError.html(error);
        }

        // fetch oidc configuration and show alternative action button if enabled
        let response = await Api.Settings.getById('oidc-config');
        if (response && response.meta && response.meta.enabled === true) {
            this.ui.oidcProvider.html(response.meta.name);
            this.ui.oidcLogin.show();
            this.ui.oidcError.show();
        }
    },

    templateContext: {
        i18n:       i18n
    }
});
