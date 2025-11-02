const Mn       = require('backbone.marionette');
const template = require('./meta.ejs');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog wide'
});
