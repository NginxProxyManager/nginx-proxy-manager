const Mn       = require('backbone.marionette');
const template = require('./main.ejs');

module.exports = Mn.View.extend({
    className: 'text-center m-7',
    template:  template,

    options: {
        btn_color: 'teal',
        links: [],      // Added to accept multiple links
        actions: []     // Added to accept multiple actions
    },

    ui: {
        action: 'a'
    },

    events: {
        'click @ui.action': function (e) {
            e.preventDefault();
            const index = $(e.currentTarget).data('index');
            this.getOption('actions')[index]();
        }
    },

    templateContext: function () {
        return {
            title:      this.getOption('title'),
            subtitle:   this.getOption('subtitle'),
            links:      this.getOption('links'),    // Changed to array
            actions:    this.getOption('actions'),  // Changed to array
            hasActions: this.getOption('actions').length > 0,
            btn_color:  this.getOption('btn_color')
        };
    }

});
