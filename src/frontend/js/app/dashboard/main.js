'use strict';

const Mn         = require('backbone.marionette');
const Cache      = require('../cache');
const Controller = require('../controller');
const Api        = require('../api');
const Helpers    = require('../../lib/helpers');
const template   = require('./main.ejs');

module.exports = Mn.View.extend({
    template: template,
    id:       'dashboard',

    stats: {},

    ui: {
        links: 'a'
    },

    events: {
        'click @ui.links': function (e) {
            e.preventDefault();
            Controller.navigate($(e.currentTarget).attr('href'), true);
        }
    },

    templateContext: function () {
        let view = this;

        return {
            getUserName: function () {
                return Cache.User.get('nickname') || Cache.User.get('name');
            },

            getHostStat: function (type) {
                if (view.stats && typeof view.stats.hosts !== 'undefined' && typeof view.stats.hosts[type] !== 'undefined') {
                    return Helpers.niceNumber(view.stats.hosts[type]);
                }

                return '-';
            }
        }
    },

    onRender: function () {
        let view = this;

        if (typeof view.stats.hosts === 'undefined') {
            Api.Reports.getHostStats()
                .then(response => {
                    if (!view.isDestroyed()) {
                        view.stats.hosts = response;
                        view.render();
                    }
                })
                .catch(err => {
                    console.log(err);
                });
        }
    }
});
