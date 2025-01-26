const _                = require('underscore');
const Mn               = require('backbone.marionette');
const App              = require('../../main');
const CertificateModel = require('../../../models/certificate');
const template         = require('./form.ejs');
const i18n             = require('../../i18n');
const dns_providers    = sortProvidersAlphabetically(require('../../../../certbot-dns-plugins'));

require('jquery-serializejson');
require('selectize');

function sortProvidersAlphabetically(obj) {
    return Object.entries(obj)
        .sort((a,b) => a[1].name.toLowerCase() > b[1].name.toLowerCase())
        .reduce((result, entry) => {
            result[entry[0]] = entry[1];
            return result;
        }, {});
}

module.exports = Mn.View.extend({
    template:      template,
    className:     'modal-dialog',
    max_file_size: 102400,

    ui: {
        form:                                 'form',
        loader_content:                       '.loader-content',
        non_loader_content:                   '.non-loader-content',
        le_error_info:                        '#le-error-info',
        domain_names:                         'input[name="domain_names"]',
        test_domains_container:               '.test-domains-container',
        test_domains_button:                  '.test-domains',
        buttons:                              '.modal-footer button',
        cancel:                               'button.cancel',
        save:                                 'button.save',
        other_certificate:                    '#other_certificate',
        other_certificate_label:              '#other_certificate_label',
        other_certificate_key:                '#other_certificate_key',
        dns_challenge_switch:                 'input[name="meta[dns_challenge]"]',
        dns_challenge_content:                '.dns-challenge',
        dns_provider:                         'select[name="meta[dns_provider]"]',
        credentials_file_content:             '.credentials-file-content',
        dns_provider_credentials:             'textarea[name="meta[dns_provider_credentials]"]',
        propagation_seconds:                  'input[name="meta[propagation_seconds]"]',
        other_certificate_key_label:          '#other_certificate_key_label',
        other_intermediate_certificate:       '#other_intermediate_certificate',
        other_intermediate_certificate_label: '#other_intermediate_certificate_label'
    },

    events: {
        'change @ui.dns_challenge_switch': function () {
            const checked = this.ui.dns_challenge_switch.prop('checked');
            if (checked) {
                this.ui.dns_provider.prop('required', 'required');
                const selected_provider = this.ui.dns_provider[0].options[this.ui.dns_provider[0].selectedIndex].value;
                if(selected_provider != '' && dns_providers[selected_provider].credentials !== false){
                    this.ui.dns_provider_credentials.prop('required', 'required');
                }
                this.ui.dns_challenge_content.show();
                this.ui.test_domains_container.hide();
            } else {
                this.ui.dns_provider.prop('required', false);
                this.ui.dns_provider_credentials.prop('required', false);
                this.ui.dns_challenge_content.hide();
                this.ui.test_domains_container.show();
            }
        },

        'change @ui.dns_provider': function () {
            const selected_provider = this.ui.dns_provider[0].options[this.ui.dns_provider[0].selectedIndex].value;
            if (selected_provider != '' && dns_providers[selected_provider].credentials !== false) {
                this.ui.dns_provider_credentials.prop('required', 'required');
                this.ui.dns_provider_credentials[0].value = dns_providers[selected_provider].credentials;
                this.ui.credentials_file_content.show();
            } else {
                this.ui.dns_provider_credentials.prop('required', false);
                this.ui.credentials_file_content.hide();
            }
        },

        'click @ui.save': function (e) {
            e.preventDefault();
            this.ui.le_error_info.hide();

            if (!this.ui.form[0].checkValidity()) {
                $('<input type="submit">').hide().appendTo(this.ui.form).click().remove();
                $(this).removeClass('btn-loading');
                return;
            }

            let data      = this.ui.form.serializeJSON();
            data.provider = this.model.get('provider');
            let ssl_files = [];

            if (data.provider === 'letsencrypt') {
                if (typeof data.meta === 'undefined') data.meta = {};

                let domain_err = false;
                if (!data.meta.dns_challenge) {
                    data.domain_names.split(',').map(function (name) {
                        if (name.match(/\*/im)) {
                            domain_err = true;
                        }
                    });
                }

                if (domain_err) {
                    alert(i18n('tls', 'no-wildcard-without-dns'));
                    return;
                }

                // Manipulate
                data.meta.letsencrypt_agree = data.meta.letsencrypt_agree == 1;
                data.meta.dns_challenge = data.meta.dns_challenge == 1;

                if(!data.meta.dns_challenge){
                    data.meta.dns_provider = undefined;
                    data.meta.dns_provider_credentials = undefined;
                    data.meta.propagation_seconds = undefined;
                } else {
                    if(data.meta.propagation_seconds === '') data.meta.propagation_seconds = undefined;
                }

                if (typeof data.domain_names === 'string' && data.domain_names) {
                    data.domain_names = data.domain_names.split(',');
                }
            } else if (data.provider === 'other' && !this.model.hasSslFiles()) {
                // check files are attached
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

            this.ui.loader_content.show();
            this.ui.non_loader_content.hide();

            // compile file data
            let form_data = new FormData();
            if (data.provider === 'other' && ssl_files.length) {
                ssl_files.map(function (file) {
                    form_data.append(file.name, file.file);
                });
            }

            new Promise(resolve => {
                if (data.provider === 'other') {
                    resolve(App.Api.Nginx.Certificates.validate(form_data));
                } else {
                    resolve();
                }
            })
                .then(() => {
                    return App.Api.Nginx.Certificates.create(data);
                })
                .then(result => {
                    this.model.set(result);

                    // Now upload the certs if we need to
                    if (data.provider === 'other') {
                        return App.Api.Nginx.Certificates.upload(this.model.get('id'), form_data)
                            .then(result => {
                                this.model.set('meta', _.assign({}, this.model.get('meta'), result));
                            });
                    }
                })
                .then(() => {
                    App.UI.closeModal(function () {
                        App.Controller.showNginxCertificates();
                    });
                })
                .catch(err => {
                    let more_info = '';
                    if (err.code === 500 && err.debug) {
                        try{
                            more_info = JSON.parse(err.debug).debug.stack.join("\n");
                        } catch(e) {}
                    }
                    this.ui.le_error_info[0].innerHTML = `${err.message}${more_info !== '' ? `<pre class="mt-3">${more_info}</pre>`:''}`;
                    this.ui.le_error_info.show();
                    this.ui.le_error_info[0].scrollIntoView();
                    this.ui.loader_content.hide();
                    this.ui.non_loader_content.show();
                });
        },
        'click @ui.test_domains_button': function (e) {
            e.preventDefault();
            const domainNames = this.ui.domain_names[0].value.split(',');
            if (domainNames && domainNames.length > 0) {
                this.model.set('domain_names', domainNames);
                this.model.set('back_to_add', true);
                App.Controller.showNginxCertificateTestReachability(this.model);
            }
        },
        'change @ui.domain_names': function(e){
            const domainNames = e.target.value.split(',');
            if (domainNames && domainNames.length > 0) {
                this.ui.test_domains_button.prop('disabled', false);
            } else {
                this.ui.test_domains_button.prop('disabled', true);
            }
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
        getUseDnsChallenge: function () {
            return typeof this.meta.dns_challenge !== 'undefined' ? this.meta.dns_challenge : false;
        },
        getDnsProvider: function () {
            return typeof this.meta.dns_provider !== 'undefined' && this.meta.dns_provider != '' ? this.meta.dns_provider : null;
        },
        getDnsProviderCredentials: function () {
            return typeof this.meta.dns_provider_credentials !== 'undefined' ? this.meta.dns_provider_credentials : '';
        },
        getPropagationSeconds: function () {
            return typeof this.meta.propagation_seconds !== 'undefined' ? this.meta.propagation_seconds : '';
        },
        dns_plugins: dns_providers,
    },

    onRender: function () {
        this.ui.domain_names.selectize({
            delimiter:    ',',
            persist:      false,
            maxOptions:   99,
            create:       function (input) {
                return {
                    value: input,
                    text:  input
                };
            },
            createFilter: /^(([^.]+\.)+[^.]+)|(\[[0-9a-f:]+\])$/
        });
        this.ui.dns_challenge_content.hide();
        this.ui.credentials_file_content.hide();
        this.ui.loader_content.hide();
        this.ui.le_error_info.hide();
        if (this.ui.domain_names[0]) {
            const domainNames = this.ui.domain_names[0].value.split(',');
            if (!domainNames || domainNames.length === 0 || (domainNames.length === 1 && domainNames[0] === "")) {
                this.ui.test_domains_button.prop('disabled', true);
            }
        }
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new CertificateModel.Model({provider: 'letsencrypt'});
        }
    }
});
