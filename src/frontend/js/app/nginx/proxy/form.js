'use strict';

const Mn                     = require('backbone.marionette');
const App                    = require('../../main');
const ProxyHostModel         = require('../../../models/proxy-host');
const template               = require('./form.ejs');
const certListItemTemplate   = require('../certificates-list-item.ejs');
const accessListItemTemplate = require('./access-list-item.ejs');
const Helpers                = require('../../../lib/helpers');

require('jquery-serializejson');
require('selectize');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:               'form',
        domain_names:       'input[name="domain_names"]',
        forward_host:       'input[name="forward_host"]',
        buttons:            '.modal-footer button',
        cancel:             'button.cancel',
        save:               'button.save',
        certificate_select: 'select[name="certificate_id"]',
        access_list_select: 'select[name="access_list_id"]',
        ssl_forced:         'input[name="ssl_forced"]',
        http2_support:      'input[name="http2_support"]',
        forward_scheme:     'select[name="forward_scheme"]',
        letsencrypt:        '.letsencrypt'
    },

    events: {
        'change @ui.certificate_select': function () {
            let id = this.ui.certificate_select.val();
            if (id === 'new') {
                this.ui.letsencrypt.show().find('input').prop('disabled', false);
            } else {
                this.ui.letsencrypt.hide().find('input').prop('disabled', true);
            }

            let enabled = id === 'new' || parseInt(id, 10) > 0;
            this.ui.ssl_forced.add(this.ui.http2_support)
                .prop('disabled', !enabled)
                .parents('.form-group')
                .css('opacity', enabled ? 1 : 0.5);
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
            data.forward_port                = parseInt(data.forward_port, 10);
            data.block_exploits              = !!data.block_exploits;
            data.caching_enabled             = !!data.caching_enabled;
            data.allow_websocket_upgrade     = !!data.allow_websocket_upgrade;

            if (typeof data.ssl_forced !== 'undefined' && data.ssl_forced === '1') {
                data.ssl_forced = true;
            }

            if (typeof data.http2_support !== 'undefined') {
                data.http2_support = !!data.http2_support;
            }

            if (typeof data.domain_names === 'string' && data.domain_names) {
                data.domain_names = data.domain_names.split(',');
            }

            // Check for any domain names containing wildcards, which are not allowed with letsencrypt
            if (data.certificate_id === 'new') {
                let domain_err = false;
                data.domain_names.map(function (name) {
                    if (name.match(/\*/im)) {
                        domain_err = true;
                    }
                });

                if (domain_err) {
                    alert('Cannot request Let\'s Encrypt Certificate for wildcard domains');
                    return;
                }

                data.meta.letsencrypt_agree = data.meta.letsencrypt_agree === '1';
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
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    templateContext: {
        getLetsencryptEmail: function () {
            return App.Cache.User.get('email');
        }
    },

    onRender: function () {
        let view = this;

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
                App.Api.Nginx.AccessLists.getAll(['items'])
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
    }
});
