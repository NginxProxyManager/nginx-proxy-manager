const Mn        = require('backbone.marionette');
const App       = require('../main');
const UserModel = require('../../models/user');
const template  = require('./permissions.ejs');

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

            let view = this;
            let data = this.ui.form.serializeJSON();

            // Manipulate
            if (view.model.isAdmin()) {
                // Force some attributes for admin
                data = _.assign({}, data, {
                    access_lists:      'manage',
                    dead_hosts:        'manage',
                    proxy_hosts:       'manage',
                    redirection_hosts: 'manage',
                    streams:           'manage',
                    certificates:      'manage'
                });
            }

            this.ui.buttons.prop('disabled', true).addClass('btn-disabled');

            App.Api.Users.setPermissions(view.model.get('id'), data)
                .then(() => {
                    if (view.model.get('id') === App.Cache.User.get('id')) {
                        App.Cache.User.set({permissions: data});
                    }

                    view.model.set({permissions: data});
                    App.UI.closeModal();
                })
                .catch(err => {
                    this.ui.error.text(err.message).show();
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    },

    templateContext: function () {
        let perms    = this.model.get('permissions');
        let is_admin = this.model.isAdmin();

        return {
            getPerm: function (key) {
                if (perms !== null && typeof perms[key] !== 'undefined') {
                    return perms[key];
                }

                return null;
            },

            getPermProps: function (key, item, forced_admin) {
                if (forced_admin && is_admin) {
                    return 'checked disabled';
                } else if (is_admin) {
                    return 'disabled';
                } else if (perms !== null && typeof perms[key] !== 'undefined' && perms[key] === item) {
                    return 'checked';
                }

                return '';
            },

            isAdmin: function () {
                return is_admin;
            }
        };
    },

    initialize: function (options) {
        if (typeof options.model === 'undefined' || !options.model) {
            this.model = new UserModel.Model();
        }
    }
});
