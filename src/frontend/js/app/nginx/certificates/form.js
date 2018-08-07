'use strict';

const _                = require('underscore');
const Mn               = require('backbone.marionette');
const App              = require('../../main');
const CertificateModel = require('../../../models/certificate');
const template         = require('./form.ejs');

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
        other_ssl_certificate:     '#other_ssl_certificate',
        other_ssl_certificate_key: '#other_ssl_certificate_key'
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
            data.provider = this.model.get('provider');

            // Manipulate
            if (typeof data.meta !== 'undefined' && typeof data.meta.letsencrypt_agree !== 'undefined') {
                data.meta.letsencrypt_agree = !!data.meta.letsencrypt_agree;
            }

            if (typeof data.domain_names === 'string' && data.domain_names) {
                data.domain_names = data.domain_names.split(',');
            }

            let method    = App.Api.Nginx.Certificates.create;
            let is_new    = true;
            let ssl_files = [];

            if (this.model.get('id')) {
                // edit
                is_new  = false;
                method  = App.Api.Nginx.Certificates.update;
                data.id = this.model.get('id');
            }

            // check files are attached
            if (this.model.get('provider') === 'other' && !this.model.hasSslFiles()) {
                if (!this.ui.other_ssl_certificate[0].files.length || !this.ui.other_ssl_certificate[0].files[0].size) {
                    alert('certificate file is not attached');
                    return;
                } else {
                    if (this.ui.other_ssl_certificate[0].files[0].size > this.max_file_size) {
                        alert('certificate file is too large (> 5kb)');
                        return;
                    }
                    ssl_files.push({name: 'certificate', file: this.ui.other_ssl_certificate[0].files[0]});
                }

                if (!this.ui.other_ssl_certificate_key[0].files.length || !this.ui.other_ssl_certificate_key[0].files[0].size) {
                    alert('certificate key file is not attached');
                    return;
                } else {
                    if (this.ui.other_ssl_certificate_key[0].files[0].size > this.max_file_size) {
                        alert('certificate key file is too large (> 5kb)');
                        return;
                    }
                    ssl_files.push({name: 'certificate_key', file: this.ui.other_ssl_certificate_key[0].files[0]});
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

                        return App.Api.Nginx.Certificates.upload(view.model.get('id'), form_data)
                            .then(result => {
                                view.model.set('meta', _.assign({}, view.model.get('meta'), result));
                            });
                    }
                })
                .then(() => {
                    App.UI.closeModal(function () {
                        if (is_new) {
                            App.Controller.showNginxCertificates();
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
            createFilter: /^(?:[^.*]+\.?)+[^.]$/
        });
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new CertificateModel.Model({provider: 'letsencrypt'});
        }
    }
});
