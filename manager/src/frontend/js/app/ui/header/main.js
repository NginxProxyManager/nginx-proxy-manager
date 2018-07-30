'use strict';

const Mn         = require('backbone.marionette');
const template   = require('./main.ejs');
const Controller = require('../../controller');

module.exports = Mn.View.extend({
    template: template,

    ui: {
        logo:   '.navbar-brand',
        links:  'a[href^="#"]'
    },

    events: {
        'click @ui.links': function (e) {
            e.preventDefault();

            let href = e.target.href.replace(/[^#]*#/g, '');

            switch (href) {
                case 'dashboard':
                    Controller.showDashboard();
                    break;

                case 'access':
                    Controller.showAccess();
                    break;

                default:
                    Controller.showDashboard();
                    break;
            }
        }
    }
});
