const Mn         = require('backbone.marionette');
const Controller = require('../../controller');
const template   = require('./item.ejs');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        meta: 'a.meta'
    },

    events: {
        'click @ui.meta': function (e) {
            e.preventDefault();
            Controller.showOpenappsecMeta(this.model);
        }
    },

    templateContext: {
        more: function() {
            switch (this.object_type) {
                case 'redirection-host':
                case 'stream':
                case 'proxy-host':
                    return this.meta.domain_names.join(', ');
            }

            return '#' + (this.object_id || '?');
        },
        createSpecificTableCell: function(value) {
            if (value && value.trim() !== '') {
                value = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
		return `<td>${value}</td>`;
            } else {
                return `<td class="text-center">-</td>`;
            }
        }
    }
});
