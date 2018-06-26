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
        links: 'a'
    },

    events: {
        'click @ui.links': function (e) {
            e.preventDefault();
            Controller.navigate($(e.currentTarget).attr('href'), true);
        }
    },

    templateContext: {
        showUsers: function () {
            return Cache.User.isAdmin();
        }
    }
});
