'use strict';

import Mn from 'backbone.marionette';

const template   = require('./item.ejs');

module.exports = Mn.View.extend({
    template: template
});
