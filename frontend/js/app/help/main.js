const Mn       = require('backbone.marionette');
const template = require('./main.ejs');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog wide',

    templateContext: function () {
        let content = this.getOption('content').split("\n");

        return {
            title:   this.getOption('title'),
            content: '<p>' + content.join('</p><p>') + '</p>'
        };
    }
});
