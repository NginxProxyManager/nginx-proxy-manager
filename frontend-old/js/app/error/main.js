const Mn       = require('backbone.marionette');
const template = require('./main.ejs');

module.exports = Mn.View.extend({
    template:  template,
    className: 'alert alert-icon alert-warning m-5',

    ui: {
        retry: 'a.retry'
    },

    events: {
        'click @ui.retry': function (e) {
            e.preventDefault();
            this.getOption('retry')();
        }
    },

    templateContext: function () {
        return {
            message: this.getOption('message'),
            code:    this.getOption('code'),
            retry:   typeof this.getOption('retry') === 'function'
        };
    }

});
