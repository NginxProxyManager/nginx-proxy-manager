const Mn                     = require('backbone.marionette');
const App                    = require('../../main');
const ProxyHostModel         = require('../../../models/proxy-host');
const ProxyLocationModel     = require('../../../models/proxy-host-location');
const template               = require('./form.ejs');
const certListItemTemplate   = require('../certificates-list-item.ejs');
const accessListItemTemplate = require('./access-list-item.ejs');
const CustomLocation         = require('./location');
const Helpers                = require('../../../lib/helpers');
const i18n                   = require('../../i18n');
const dns_providers          = require('../../../../../global/certbot-dns-plugins');


require('jquery-serializejson');
require('selectize');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    locationsCollection: new ProxyLocationModel.Collection(),

    ui: {
        form:                     'form',
        domain_names:             'input[name="domain_names"]',
        forward_host:             'input[name="forward_host"]',
        buttons:                  '.modal-footer button',
        cancel:                   'button.cancel',
        save:                     'button.save',
        add_location_btn:         'button.add_location',
        locations_container:      '.locations_container',
        le_error_info:            '#le-error-info',
        certificate_select:       'select[name="certificate_id"]',
        access_list_select:       'select[name="access_list_id"]',
        ssl_forced:               'input[name="ssl_forced"]',
        hsts_enabled:             'input[name="hsts_enabled"]',
        hsts_subdomains:          'input[name="hsts_subdomains"]',
        http2_support:            'input[name="http2_support"]',
        dns_challenge_switch:     'input[name="meta[dns_challenge]"]',
        dns_challenge_content:    '.dns-challenge',
        dns_provider:             'select[name="meta[dns_provider]"]',
        credentials_file_content: '.credentials-file-content',
        dns_provider_credentials: 'textarea[name="meta[dns_provider_credentials]"]',
        propagation_seconds:      'input[name="meta[propagation_seconds]"]',
        forward_scheme:           'select[name="forward_scheme"]',
        letsencrypt:              '.letsencrypt',
        enable_proxy_protocol:    'input[name="enable_proxy_protocol"]',
        load_balancer_ip:         'input[name="load_balancer_ip"]'
    },

    regions: {
        locations_regions: '@ui.locations_container'
    },

    events: {
        'change @ui.enable_proxy_protocol': function () {
            let checked = this.ui.enable_proxy_protocol.prop('checked');
            this.ui.load_balancer_ip
                .prop('disabled', !checked)
                .parents('.form-group')
                .css('opacity', checked ? 1 : 0.5);
        },

        'change @ui.certificate_select': function () {
            let id = this.ui.certificate_select.val();
            if (id === 'new') {
                this.ui.letsencrypt.show().find('input').prop('disabled', false);
                this.ui.dns_challenge_content.hide();
            } else {
                this.ui.letsencrypt.hide().find('input').prop('disabled', true);
            }

            let enabled = id === 'new' || parseInt(id, 10) > 0;

            let inputs = this.ui.ssl_forced.add(this.ui.http2_support);
            inputs
                .prop('disabled', !enabled)
                .parents('.form-group')
                .css('opacity', enabled ? 1 : 0.5);

            if (!enabled) {
                inputs.prop('checked', false);
            }

            inputs.trigger('change');
        },

        'change @ui.ssl_forced': function () {
            let checked = this.ui.ssl_forced.prop('checked');
            this.ui.hsts_enabled
                .prop('disabled', !checked)
                .parents('.form-group')
                .css('opacity', checked ? 1 : 0.5);

            if (!checked) {
                this.ui.hsts_enabled.prop('checked', false);
            }

            this.ui.hsts_enabled.trigger('change');
        },

        'change @ui.hsts_enabled': function () {
            let checked = this.ui.hsts_enabled.prop('checked');
            this.ui.hsts_subdomains
                .prop('disabled', !checked)
                .parents('.form-group')
                .css('opacity', checked ? 1 : 0.5);

            if (!checked) {
                this.ui.hsts_subdomains.prop('checked', false);
            }
        },

        'change @ui.dns_challenge_switch': function () {
            const checked = this.ui.dns_challenge_switch.prop('checked');
            if (checked) {
                this.ui.dns_provider.prop('required', 'required');
                const selected_provider = this.ui.dns_provider[0].options[this.ui.dns_provider[0].selectedIndex].value;
                if(selected_provider != '' && dns_providers[selected_provider].credentials !== false){
                    this.ui.dns_provider_credentials.prop('required', 'required');
                }
                this.ui.dns_challenge_content.show();
            } else {
                this.ui.dns_provider.prop('required', false);
                this.ui.dns_provider_credentials.prop('required', false);
                this.ui.dns_challenge_content.hide();                
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

        'click @ui.add_location_btn': function (e) {
            e.preventDefault();
            
            const model = new ProxyLocationModel.Model();
            this.locationsCollection.add(model);
        },

        'click @ui.save': function (e) {
            e.preventDefault();
            this.ui.le_error_info.hide();

            if (!this.ui.form[0].checkValidity()) {
                $('<input type="submit">').hide().appendTo(this.ui.form).click().remove();
                return;
            }

            let view = this;
            let data = this.ui.form.serializeJSON();

            // Add locations
            data.locations = [];
            this.locationsCollection.models.forEach((location) => {
                data.locations.push(location.toJSON());
            });

            // Serialize collects path from custom locations
            // This field must be removed from root object
            delete data.path;

            // Manipulate
            data.forward_port            = parseInt(data.forward_port, 10);
            data.block_exploits          = !!data.block_exploits;
            data.caching_enabled         = !!data.caching_enabled;
            data.allow_websocket_upgrade = !!data.allow_websocket_upgrade;
            data.enable_proxy_protocol   = !!data.enable_proxy_protocol;
            data.http2_support           = !!data.http2_support;
            data.hsts_enabled            = !!data.hsts_enabled;
            data.hsts_subdomains         = !!data.hsts_subdomains;
            data.ssl_forced              = !!data.ssl_forced;
            
            if (typeof data.meta === 'undefined') data.meta = {};
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

            // Check for any domain names containing wildcards, which are not allowed with letsencrypt
            if (data.certificate_id === 'new') {                
                let domain_err = false;
                if (!data.meta.dns_challenge) {
                    data.domain_names.map(function (name) {
                        if (name.match(/\*/im)) {
                            domain_err = true;
                        }
                    });
                }

                if (domain_err) {
                    alert(i18n('ssl', 'no-wildcard-without-dns'));
                    return;
                }
            } else {
                data.certificate_id = parseInt(data.certificate_id, 10);
            }

            let method = App.Api.Nginx.ProxyHosts.create;
            let is_new = true;

            if (this.model.get('id')) {
                // edit
                is_new  = false;
                method  = App.Api.Nginx.ProxyHosts.update;
                data.id = this.model.get('id');
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            this.ui.save.addClass('btn-loading');

            method(data)
                .then(result => {
                    view.model.set(result);

                    App.UI.closeModal(function () {
                        if (is_new) {
                            App.Controller.showNginxProxy();
                        }
                    });
                })
                .catch(err => {
                    let more_info = '';
                    if(err.code === 500 && err.debug){
                        try{
                            more_info = JSON.parse(err.debug).debug.stack.join("\n");
                        } catch(e) {}
                    }
                    this.ui.le_error_info[0].innerHTML = `${err.message}${more_info !== '' ? `<pre class="mt-3">${more_info}</pre>`:''}`;
                    this.ui.le_error_info.show();
                    this.ui.le_error_info[0].scrollIntoView();
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                    this.ui.save.removeClass('btn-loading');
                });
        }
    },

    templateContext: {
        getLetsencryptEmail: function () {
            return App.Cache.User.get('email');
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
        let view = this;

        this.ui.enable_proxy_protocol.trigger('change');
        this.ui.ssl_forced.trigger('change');
        this.ui.hsts_enabled.trigger('change');

        // Domain names
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

        // Access Lists
        this.ui.access_list_select.selectize({
            valueField:       'id',
            labelField:       'name',
            searchField:      ['name'],
            create:           false,
            preload:          true,
            allowEmptyOption: true,
            render:           {
                option: function (item) {
                    item.i18n         = App.i18n;
                    item.formatDbDate = Helpers.formatDbDate;
                    return accessListItemTemplate(item);
                }
            },
            load:             function (query, callback) {
                App.Api.Nginx.AccessLists.getAll(['items', 'clients'])
                    .then(rows => {
                        callback(rows);
                    })
                    .catch(err => {
                        console.error(err);
                        callback();
                    });
            },
            onLoad:           function () {
                view.ui.access_list_select[0].selectize.setValue(view.model.get('access_list_id'));
            }
        });

        // Certificates
        this.ui.le_error_info.hide();
        this.ui.dns_challenge_content.hide();
        this.ui.credentials_file_content.hide();
        this.ui.letsencrypt.hide();
        this.ui.certificate_select.selectize({
            valueField:       'id',
            labelField:       'nice_name',
            searchField:      ['nice_name', 'domain_names'],
            create:           false,
            preload:          true,
            allowEmptyOption: true,
            render:           {
                option: function (item) {
                    item.i18n         = App.i18n;
                    item.formatDbDate = Helpers.formatDbDate;
                    return certListItemTemplate(item);
                }
            },
            load:             function (query, callback) {
                App.Api.Nginx.Certificates.getAll()
                    .then(rows => {
                        callback(rows);
                    })
                    .catch(err => {
                        console.error(err);
                        callback();
                    });
            },
            onLoad:           function () {
                view.ui.certificate_select[0].selectize.setValue(view.model.get('certificate_id'));
            }
        });
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new ProxyHostModel.Model();
        }

        this.locationsCollection = new ProxyLocationModel.Collection();

        // Custom locations
        this.showChildView('locations_regions', new CustomLocation.LocationCollectionView({
            collection: this.locationsCollection
        }));

        // Check wether there are any location defined
        if (options.model && Array.isArray(options.model.attributes.locations)) {
            options.model.attributes.locations.forEach((location) => {
                let m = new ProxyLocationModel.Model(location);
                this.locationsCollection.add(m);
            });
        }
    }
});
