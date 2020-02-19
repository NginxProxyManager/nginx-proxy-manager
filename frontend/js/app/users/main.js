const Mn        = require('backbone.marionette');
const App       = require('../main');
const UserModel = require('../../models/user');
const ListView  = require('./list/main');
const ErrorView = require('../error/main');
const template  = require('./main.ejs');

module.exports = Mn.View.extend({
    id:       'users',
    template: template,

    ui: {
        list_region: '.list-region',
        add:         '.add-item',
        dimmer:      '.dimmer'
    },

    regions: {
        list_region: '@ui.list_region'
    },

    events: {
        'click @ui.add': function (e) {
            e.preventDefault();
            App.Controller.showUserForm(new UserModel.Model());
        }
    },

    onRender: function () {
        let view = this;

        App.Api.Users.getAll(['permissions'])
            .then(response => {
                if (!view.isDestroyed() && response && response.length) {
                    view.showChildView('list_region', new ListView({
                        collection: new UserModel.Collection(response)
                    }));
                }
            })
            .catch(err => {
                view.showChildView('list_region', new ErrorView({
                    code:    err.code,
                    message: err.message,
                    retry:   function () {
                        App.Controller.showUsers();
                    }
                }));

                console.error(err);
            })
            .then(() => {
                view.ui.dimmer.removeClass('active');
            });
    }
});
