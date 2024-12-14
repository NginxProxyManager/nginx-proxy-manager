const Mn       = require('backbone.marionette');
const template = require('./main.ejs');
const Cache    = require('../../cache');

module.exports = Mn.View.extend({
    className: 'container',
    template:  template
});
