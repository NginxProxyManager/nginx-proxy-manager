const Mn       = require('backbone.marionette');
const template = require('./item.ejs');

module.exports = Mn.View.extend({
    template:  template,
    className: 'row'
});
