const Mn       = require('backbone.marionette');
const App      = require('../../main');
const Tokens   = require('../../tokens');
const template = require('./item.ejs');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        edit:        'a.edit-user',
        permissions: 'a.edit-permissions',
        password:    'a.set-password',
        login:       'a.login',
        delete:      'a.delete-user'
    },

    events: {
        'click @ui.edit': function (e) {
            e.preventDefault();
            App.Controller.showUserForm(this.model);
        },

        'click @ui.permissions': function (e) {
            e.preventDefault();
            App.Controller.showUserPermissions(this.model);
        },

        'click @ui.password': function (e) {
            e.preventDefault();
            App.Controller.showUserPasswordForm(this.model);
        },

        'click @ui.delete': function (e) {
            e.preventDefault();
            App.Controller.showUserDeleteConfirm(this.model);
        },

        'click @ui.login': function (e) {
            e.preventDefault();

            if (App.Cache.User.get('id') !== this.model.get('id')) {
                this.ui.login.prop('disabled', true).addClass('btn-disabled');

                App.Api.Users.loginAs(this.model.get('id'))
                    .then(res => {
                        Tokens.addToken(res.token, res.user.nickname || res.user.name);
                        window.location = '/';
                        window.location.reload();
                    })
                    .catch(err => {
                        alert(err.message);
                        this.ui.login.prop('disabled', false).removeClass('btn-disabled');
                    });
            }
        }
    },

    templateContext: {
        isSelf: function () {
            return App.Cache.User.get('id') === this.id;
        }
    },

    initialize: function () {
        this.listenTo(this.model, 'change', this.render);
    }
});
