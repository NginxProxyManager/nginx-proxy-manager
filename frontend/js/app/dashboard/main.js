const Mn         = require('backbone.marionette');
const Cache      = require('../cache');
const Controller = require('../controller');
const Api        = require('../api');
const Helpers    = require('../../lib/helpers');
const template   = require('./main.ejs');

module.exports = Mn.View.extend({
    template: template,
    id:       'dashboard',
    columns:  0,

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
            },

            canShow: function (perm) {
                return Cache.User.isAdmin() || Cache.User.canView(perm);
            },

            columns: view.columns
        };
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
    },

    /**
     * @param {Object}  [model]
     */
    preRender: function (model) {
        this.columns = 0;

        // calculate the available columns based on permissions for the objects
        // and store as a variable
        //let view = this;
        let perms = ['proxy_hosts', 'redirection_hosts', 'streams', 'dead_hosts'];

        perms.map(perm => {
            this.columns += Cache.User.isAdmin() || Cache.User.canView(perm) ? 1 : 0;
        });

        // Prevent double rendering on initial calls
        if (typeof model !== 'undefined') {
            this.render();
        }
    },

    initialize: function () {
        this.preRender();
        this.listenTo(Cache.User, 'change', this.preRender);
    }
});
