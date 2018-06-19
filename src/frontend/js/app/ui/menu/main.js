'use strict';

const Mn       = require('backbone.marionette');
const template = require('./main.ejs');

module.exports = Mn.View.extend({
    id:        'menu',
    className: 'header collapse d-lg-flex p-0',
    template:  template
});
