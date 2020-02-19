const Mn       = require('backbone.marionette');
const template = require('./main.ejs');
const Cache    = require('../../cache');

module.exports = Mn.View.extend({
    className: 'container',
    template:  template,

    templateContext: {
        getVersion: function () {
            return Cache.version || '0.0.0';
        }
    }
});
