'use strict';

const _           = require('underscore');
const Mn          = require('backbone.marionette');
const App         = require('../../main');
const StreamModel = require('../../../models/stream');
const template    = require('./form.ejs');

require('jquery-serializejson');
require('jquery-mask-plugin');
require('selectize');

module.exports = Mn.View.extend({
    template:      template,
    className:     'modal-dialog',
    max_file_size: 5120,

    ui: {
        form:       'form',
        forward_ip: 'input[name="forward_ip"]',
        buttons:    '.modal-footer button',
        cancel:     'button.cancel',
        save:       'button.save'
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

            let method = App.Api.Nginx.Streams.create;
            let is_new = true;

            if (this.model.get('id')) {
                // edit
                is_new  = false;
                method  = App.Api.Nginx.Streams.update;
                data.id = this.model.get('id');
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');
            method(data)
                .then(result => {
                    view.model.set(result);

                    App.UI.closeModal(function () {
                        if (is_new) {
                            App.Controller.showNginxStream();
                        }
                    });
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    onRender: function () {
        this.ui.forward_ip.mask('099.099.099.099', {
            clearIfNotMatch: true,
            placeholder:     '000.000.000.000'
        });
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new StreamModel.Model();
        }
    }
});
