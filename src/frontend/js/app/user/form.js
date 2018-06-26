'use strict';

const Mn         = require('backbone.marionette');
const template   = require('./form.ejs');
const Controller = require('../controller');
const Cache      = require('../cache');
const Api        = require('../api');
const App        = require('../main');
const UserModel  = require('../../models/user');

require('jquery-serializejson');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:    'form',
        buttons: '.modal-footer button',
        cancel:  'button.cancel',
        save:    'button.save',
        error:   '.secret-error'
    },

    events: {

        'click @ui.save': function (e) {
            e.preventDefault();
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
                    App.UI.closeModal();
                })
                .catch(err => {
                    this.ui.error.text(err.message).show();
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    templateContext: function () {
        let view = this;

        return {
            isSelf: function () {
                return view.model.get('id') === Cache.User.get('id');
            },

            isAdmin: function () {
                return view.model.isAdmin();
            },

            isDisabled: function () {
                return view.model.isDisabled();
            }
        };
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new UserModel.Model();
        }
    }
});
