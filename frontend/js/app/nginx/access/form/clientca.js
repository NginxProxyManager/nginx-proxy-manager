const Mn       = require('backbone.marionette');
const template = require('./clientca.ejs');

module.exports = Mn.View.extend({
    template:  template,
    className: 'row'
});
