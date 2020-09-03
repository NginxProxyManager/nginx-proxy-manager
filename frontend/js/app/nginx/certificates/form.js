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
    max_file_size: 102400,

    ui: {
        form:                                 'form',
        domain_names:                         'input[name="domain_names"]',
        buttons:                              '.modal-footer button',
        cancel:                               'button.cancel',
        save:                                 'button.save',
        other_certificate:                    '#other_certificate',
        other_certificate_label:              '#other_certificate_label',
        other_certificate_key:                '#other_certificate_key',
        cloudflare_switch:                    'input[name="meta[cloudflare_use]"]',
        cloudflare_token:                     'input[name="meta[cloudflare_token]"',
        cloudflare:                           '.cloudflare',
        other_certificate_key_label:          '#other_certificate_key_label',
        other_intermediate_certificate:       '#other_intermediate_certificate',
        other_intermediate_certificate_label: '#other_intermediate_certificate_label'
    },
    
    events: {
        'change @ui.cloudflare_switch': function() {
            let checked = this.ui.cloudflare_switch.prop('checked');
            if (checked) {                
                this.ui.cloudflare_token.prop('required', 'required');
                this.ui.cloudflare.show();
            } else {                
                this.ui.cloudflare_token.prop('required', false);
                this.ui.cloudflare.hide();                
            }
        },
        'click @ui.save': function (e) {
            e.preventDefault();

            if (!this.ui.form[0].checkValidity()) {
                $('<input type="submit">').hide().appendTo(this.ui.form).click().remove();
                $(this).removeClass('btn-loading');
                return;
            }

            let view      = this;
            let data      = this.ui.form.serializeJSON();
            data.provider = this.model.get('provider');



            let domain_err = false;
            if (!data.meta.cloudflare_use) {                
                data.domain_names.split(',').map(function (name) {
                    if (name.match(/\*/im)) {
                        domain_err = true;
                    }
                });
            }

            if (domain_err) {
                alert('Cannot request Let\'s Encrypt Certificate for wildcard domains when not using CloudFlare DNS');
                return;
            }

            // Manipulate
            if (typeof data.meta !== 'undefined' && typeof data.meta.letsencrypt_agree !== 'undefined') {
                data.meta.letsencrypt_agree = !!data.meta.letsencrypt_agree;
            }
            if (typeof data.meta !== 'undefined' && typeof data.meta.cloudflare_use !== 'undefined') {
                data.meta.cloudflare_use = !!data.meta.cloudflare_use;
            }

            if (typeof data.domain_names === 'string' && data.domain_names) {
                data.domain_names = data.domain_names.split(',');
            }

            let ssl_files = [];

            // check files are attached
            if (this.model.get('provider') === 'other' && !this.model.hasSslFiles()) {
                if (!this.ui.other_certificate[0].files.length || !this.ui.other_certificate[0].files[0].size) {
                    alert('Certificate file is not attached');
                    return;
                } else {
                    if (this.ui.other_certificate[0].files[0].size > this.max_file_size) {
                        alert('Certificate file is too large (> 100kb)');
                        return;
                    }
                    ssl_files.push({name: 'certificate', file: this.ui.other_certificate[0].files[0]});
                }

                if (!this.ui.other_certificate_key[0].files.length || !this.ui.other_certificate_key[0].files[0].size) {
                    alert('Certificate key file is not attached');
                    return;
                } else {
                    if (this.ui.other_certificate_key[0].files[0].size > this.max_file_size) {
                        alert('Certificate key file is too large (> 100kb)');
                        return;
                    }
                    ssl_files.push({name: 'certificate_key', file: this.ui.other_certificate_key[0].files[0]});
                }

                if (this.ui.other_intermediate_certificate[0].files.length && this.ui.other_intermediate_certificate[0].files[0].size) {
                    if (this.ui.other_intermediate_certificate[0].files[0].size > this.max_file_size) {
                        alert('Intermediate Certificate file is too large (> 100kb)');
                        return;
                    }
                    ssl_files.push({name: 'intermediate_certificate', file: this.ui.other_intermediate_certificate[0].files[0]});
                }
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            this.ui.save.addClass('btn-loading');

            // compile file data
            let form_data = new FormData();
            if (view.model.get('provider') && ssl_files.length) {
                ssl_files.map(function (file) {
                    form_data.append(file.name, file.file);
                });
            }

            new Promise(resolve => {
                if (view.model.get('provider') === 'other') {
                    resolve(App.Api.Nginx.Certificates.validate(form_data));
                } else {
                    resolve();
                }
            })
                .then(() => {
                    return App.Api.Nginx.Certificates.create(data);
                })
                .then(result => {
                    view.model.set(result);

                    // Now upload the certs if we need to
                    if (view.model.get('provider') === 'other') {
                        return App.Api.Nginx.Certificates.upload(view.model.get('id'), form_data)
                            .then(result => {
                                view.model.set('meta', _.assign({}, view.model.get('meta'), result));
                            });
                    }
                })
                .then(() => {
                    App.UI.closeModal(function () {
                        App.Controller.showNginxCertificates();
                    });
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                    this.ui.save.removeClass('btn-loading');
                });
        },
        'change @ui.other_certificate_key': function(e){
            this.setFileName("other_certificate_key_label", e)
        },
        'change @ui.other_certificate': function(e){
            this.setFileName("other_certificate_label", e)
        },
        'change @ui.other_intermediate_certificate': function(e){
            this.setFileName("other_intermediate_certificate_label", e)
        }
    },
    setFileName(ui, e){
        this.getUI(ui).text(e.target.files[0].name)
    },
    templateContext: {
        getLetsencryptEmail: function () {
            return typeof this.meta.letsencrypt_email !== 'undefined' ? this.meta.letsencrypt_email : App.Cache.User.get('email');
        },

        getLetsencryptAgree: function () {
            return typeof this.meta.letsencrypt_agree !== 'undefined' ? this.meta.letsencrypt_agree : false;
        },

        getCloudflareUse: function () {
            return typeof this.meta.cloudflare_use !== 'undefined' ? this.meta.cloudflare_use : false;
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
            createFilter: /^(?:[^.]+\.?)+[^.]$/
        });
        this.ui.cloudflare.hide();
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new CertificateModel.Model({provider: 'letsencrypt'});
        }
    }
});
