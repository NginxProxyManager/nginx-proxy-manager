'use strict';

const $          = require('jquery');
const Mn         = require('backbone.marionette');
const Controller = require('../../controller');
const Cache      = require('../../cache');
const template   = require('./main.ejs');

module.exports = Mn.View.extend({
    id:        'menu',
    className: 'header collapse d-lg-flex p-0',
    template:  template,

    ui: {
        link: 'a'
    },

    events: {
        'click @ui.link': function (e) {
            e.preventDefault();
            let href = $(e.currentTarget).attr('href');

            switch (href) {
                case '/':
                    Controller.showDashboard();
                    break;
                case '/users':
                    Controller.showUsers();
                    break;
            }
        }
    },

    templateContext: {
        showUsers: function () {
            return Cache.User.isAdmin();
        }
    }
});
