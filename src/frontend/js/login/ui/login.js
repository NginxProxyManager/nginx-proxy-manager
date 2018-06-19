'use strict';

const $        = require('jquery');
const Mn       = require('backbone.marionette');
const template = require('./login.ejs');
const Api      = require('../../app/api');

module.exports = Mn.View.extend({
    template:  template,
    className: 'page-single',

    ui: {
        form:     'form',
        identity: 'input[name="identity"]',
        secret:   'input[name="secret"]',
        error:    '.secret-error',
        button:   'button'
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
                .catch(err => {
                    this.ui.error.text(err.message).show();
                    this.ui.button.removeClass('btn-loading').prop('disabled', false);
                });
        }
    },

    templateContext: {
        getVersion: function () {
            return $('#login').data('version');
        }
    }
});
