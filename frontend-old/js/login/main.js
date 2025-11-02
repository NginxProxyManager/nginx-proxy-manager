const Mn        = require('backbone.marionette');
const LoginView = require('./ui/login');

const App = Mn.Application.extend({
    region: '#login',
    UI:     null,

    onStart: function (/*app, options*/) {
        this.getRegion().show(new LoginView());
    }
});

const app      = new App();
module.exports = app;
