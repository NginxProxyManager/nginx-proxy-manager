'use strict';

const Mn         = require('backbone.marionette');
const UserModel  = require('../../models/user');
const Api        = require('../api');
const Controller = require('../controller');
const ListView   = require('./list/main');
const template   = require('./main.ejs');

module.exports = Mn.View.extend({
    id:        'users',
    template:  template,

    ui: {
        list_region: '.list-region',
        add_user:    '.add-user',
        dimmer:      '.dimmer'
    },

    regions: {
        list_region: '@ui.list_region'
    },

    events: {
        'click @ui.add_user': function (e) {
            e.preventDefault();
            Controller.showUserForm(new UserModel.Model());
        }
    },

    onRender: function () {
        let view = this;

        Api.Users.getAll()
            .then(response => {
                if (!view.isDestroyed() && response && response.length) {
                    view.showChildView('list_region', new ListView({
                        collection: new UserModel.Collection(response)
                    }));

                    // Remove loader
                    view.ui.dimmer.removeClass('active');
                }
            })
            .catch(err => {
                console.log(err);
                //Controller.showError(err, 'Could not fetch Users');
                //view.trigger('loaded');
            });
    }
});
