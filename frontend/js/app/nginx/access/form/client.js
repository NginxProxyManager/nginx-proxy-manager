const Mn       = require('backbone.marionette');
const template = require('./client.ejs');

module.exports = Mn.View.extend({
    template:  template,
    className: 'row'
});
