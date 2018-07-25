'use strict';

const _                    = require('underscore');
const Mn                   = require('backbone.marionette');
const App                  = require('../../main');
const RedirectionHostModel = require('../../../models/redirection-host');
const template             = require('./form.ejs');

require('jquery-serializejson');
require('selectize');

module.exports = Mn.View.extend({
    template:      template,
    className:     'modal-dialog',
    max_file_size: 5120,

    ui: {
        form:                      'form',
        domain_names:              'input[name="domain_names"]',
        buttons:                   '.modal-footer button',
        cancel:                    'button.cancel',
        save:                      'button.save',
        ssl_enabled:               'input[name="ssl_enabled"]',
        ssl_options:               '#ssl-options input',
        ssl_provider:              'input[name="ssl_provider"]',
        other_ssl_certificate:     '#other_ssl_certificate',
        other_ssl_certificate_key: '#other_ssl_certificate_key',

        // SSL hiding and showing
        all_ssl:         '.letsencrypt-ssl, .other-ssl',
        letsencrypt_ssl: '.letsencrypt-ssl',
        other_ssl:       '.other-ssl'
    },

    events: {
        'change @ui.ssl_enabled': function () {
            let enabled = this.ui.ssl_enabled.prop('checked');
            this.ui.ssl_options.not(this.ui.ssl_enabled).prop('disabled', !enabled).parents('.form-group').css('opacity', enabled ? 1 : 0.5);
            this.ui.ssl_provider.trigger('change');
        },

        'change @ui.ssl_provider': function () {
            let enabled  = this.ui.ssl_enabled.prop('checked');
            let provider = this.ui.ssl_provider.filter(':checked').val();
            this.ui.all_ssl.hide().find('input').prop('disabled', true);
            this.ui[provider + '_ssl'].show().find('input').prop('disabled', !enabled);
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
            data.block_exploits = !!data.block_exploits;
            data.preserve_path  = !!data.preserve_path;
            data.ssl_enabled    = !!data.ssl_enabled;
            data.ssl_forced     = !!data.ssl_forced;

            if (typeof data.meta !== 'undefined' && typeof data.meta.letsencrypt_agree !== 'undefined') {
                data.meta.letsencrypt_agree = !!data.meta.letsencrypt_agree;
            }

            if (typeof data.domain_names === 'string' && data.domain_names) {
                data.domain_names = data.domain_names.split(',');
            }

            let require_ssl_files = typeof data.ssl_enabled !== 'undefined' && data.ssl_enabled && typeof data.ssl_provider !== 'undefined' && data.ssl_provider === 'other';
            let ssl_files         = [];
            let method            = App.Api.Nginx.RedirectionHosts.create;
            let is_new            = true;

            let must_require_ssl_files = require_ssl_files && !view.model.hasSslFiles('other');

            if (this.model.get('id')) {
                // edit
                is_new  = false;
                method  = App.Api.Nginx.RedirectionHosts.update;
                data.id = this.model.get('id');
            }

            // check files are attached
            if (require_ssl_files) {
                if (!this.ui.other_ssl_certificate[0].files.length || !this.ui.other_ssl_certificate[0].files[0].size) {
                    if (must_require_ssl_files) {
                        alert('certificate file is not attached');
                        return;
                    }
                } else {
                    if (this.ui.other_ssl_certificate[0].files[0].size > this.max_file_size) {
                        alert('certificate file is too large (> 5kb)');
                        return;
                    }
                    ssl_files.push({name: 'other_certificate', file: this.ui.other_ssl_certificate[0].files[0]});
                }

                if (!this.ui.other_ssl_certificate_key[0].files.length || !this.ui.other_ssl_certificate_key[0].files[0].size) {
                    if (must_require_ssl_files) {
                        alert('certificate key file is not attached');
                        return;
                    }
                } else {
                    if (this.ui.other_ssl_certificate_key[0].files[0].size > this.max_file_size) {
                        alert('certificate key file is too large (> 5kb)');
                        return;
                    }
                    ssl_files.push({name: 'other_certificate_key', file: this.ui.other_ssl_certificate_key[0].files[0]});
                }
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            method(data)
                .then(result => {
                    view.model.set(result);

                    // Now upload the certs if we need to
                    if (ssl_files.length) {
                        let form_data = new FormData();

                        ssl_files.map(function (file) {
                            form_data.append(file.name, file.file);
                        });

                        return App.Api.Nginx.RedirectionHosts.setCerts(view.model.get('id'), form_data)
                            .then(result => {
                                view.model.set('meta', _.assign({}, view.model.get('meta'), result));
                            });
                    }
                })
                .then(() => {
                    App.UI.closeModal(function () {
                        if (is_new) {
                            App.Controller.showNginxRedirection();
                        }
                    });
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    templateContext: {
        getLetsencryptEmail: function () {
            return typeof this.meta.letsencrypt_email !== 'undefined' ? this.meta.letsencrypt_email : App.Cache.User.get('email');
        },

        getLetsencryptAgree: function () {
            return typeof this.meta.letsencrypt_agree !== 'undefined' ? this.meta.letsencrypt_agree : false;
        }
    },

    onRender: function () {
        this.ui.ssl_enabled.trigger('change');
        this.ui.ssl_provider.trigger('change');

        this.ui.domain_names.selectize({
            delimiter:    ',',
            persist:      false,
            maxOptions:   15,
            create:       function (input) {
                return {
                    value: input,
                    text:  input
                };
            },
            createFilter: /^(?:\*\.)?(?:[^.*]+\.?)+[^.]$/
        });
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new RedirectionHostModel.Model();
        }
    }
});
