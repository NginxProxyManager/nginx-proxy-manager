'use strict';

const Mn       = require('backbone.marionette');
const template = require('./main.ejs');

module.exports = Mn.View.extend({
    template: template,
    id:       'nginx-access'
});
