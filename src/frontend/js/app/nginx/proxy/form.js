'use strict';

const Mn             = require('backbone.marionette');
const template       = require('./form.ejs');
const Controller     = require('../../controller');
const Cache          = require('../../cache');
const Api            = require('../../api');
const App            = require('../../main');
const ProxyHostModel = require('../../../models/proxy-host');

require('jquery-serializejson');
require('jquery-mask-plugin');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:       'form',
        forward_ip: 'input[name="forward_ip"]',
        buttons:    '.modal-footer button',
        cancel:     'button.cancel',
        save:       'button.save',
        error:      '.secret-error'
    },

    events: {

        'click @ui.save': function (e) {
            e.preventDefault();
            return;

            this.ui.error.hide();
            let view = this;
            let data = this.ui.form.serializeJSON();

            // Manipulate
            data.roles = [];
            if ((this.model.get('id') === Cache.User.get('id') && this.model.isAdmin()) || (typeof data.is_admin !== 'undefined' && data.is_admin)) {
                data.roles.push('admin');
                delete data.is_admin;
            }

            data.is_disabled = typeof data.is_disabled !== 'undefined' ? !!data.is_disabled : false;
            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            let method = Api.Users.create;

            if (this.model.get('id')) {
                // edit
                method  = Api.Users.update;
                data.id = this.model.get('id');
            }

            method(data)
                .then(result => {
                    if (result.id === Cache.User.get('id')) {
                        Cache.User.set(result);
                    }

                    if (view.model.get('id') !== Cache.User.get('id')) {
                        Controller.showUsers();
                    }

                    view.model.set(result);
                    App.UI.closeModal(function () {
                        if (method === Api.Users.create) {
                            // Show permissions dialog immediately
                            Controller.showUserPermissions(view.model);
                        }
                    });
                })
                .catch(err => {
                    this.ui.error.text(err.message).show();
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    onRender: function () {
        this.ui.forward_ip.mask('099.099.099.099', {
            clearIfNotMatch: true,
            placeholder:     '000.000.000.000'
        });
        /*
        this.ui.forward_ip.mask('099.099.099.099', {
            reverse:         true,
            clearIfNotMatch: true,
            placeholder:     '000.000.000.000'
        });
        */
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new ProxyHostModel.Model();
        }
    }
});
