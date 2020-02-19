const Mn       = require('backbone.marionette');
const App      = require('../../main');
const template = require('./item.ejs');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        edit: 'a.edit'
    },

    events: {
        'click @ui.edit': function (e) {
            e.preventDefault();
            App.Controller.showSettingForm(this.model);
        }
    },

    initialize: function () {
        this.listenTo(this.model, 'change', this.render);
    }
});
