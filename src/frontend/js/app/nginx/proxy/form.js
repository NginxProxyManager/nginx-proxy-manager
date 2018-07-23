'use strict';

const _              = require('underscore');
const Mn             = require('backbone.marionette');
const App            = require('../../main');
const ProxyHostModel = require('../../../models/proxy-host');
const template       = require('./form.ejs');

require('jquery-serializejson');
require('jquery-mask-plugin');
require('selectize');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:         'form',
        domain_names: 'input[name="domain_names"]',
        forward_ip:   'input[name="forward_ip"]',
        buttons:      '.modal-footer button',
        cancel:       'button.cancel',
        save:         'button.save',
        ssl_enabled:  'input[name="ssl_enabled"]',
        ssl_options:  '#ssl-options input',
        ssl_provider: 'input[name="ssl_provider"]',

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
            data.forward_port = parseInt(data.forward_port, 10);
            _.map(data, function (item, idx) {
                if (typeof item === 'string' && item === '1') {
                    item = true;
                } else if (typeof item === 'object' && item !== null) {
                    _.map(item, function (item2, idx2) {
                        if (typeof item2 === 'string' && item2 === '1') {
                            item[idx2] = true;
                        }
                    });
                }
                data[idx] = item;
            });

            if (typeof data.domain_names === 'string' && data.domain_names) {
                data.domain_names = data.domain_names.split(',');
            }

            // Process
            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            let method = App.Api.Nginx.ProxyHosts.create;

            if (this.model.get('id')) {
                // edit
                method  = App.Api.Nginx.ProxyHosts.update;
                data.id = this.model.get('id');
            }

            method(data)
                .then(result => {
                    view.model.set(result);
                    App.UI.closeModal(function () {
                        if (method === App.Api.Nginx.ProxyHosts.create) {
                            App.Controller.showNginxProxy();
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
        this.ui.forward_ip.mask('099.099.099.099', {
            clearIfNotMatch: true,
            placeholder:     '000.000.000.000'
        });

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
            this.model = new ProxyHostModel.Model();
        }
    }
});
