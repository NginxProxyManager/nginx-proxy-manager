const Mn       = require('backbone.marionette');
const template = require('./form-server.ejs');

module.exports = Mn.View.extend({
    template: template,
    className: 'row',
    ui: {
        delete: 'a.delete'
    },

    events: {
        'change input': function(e) {
            this.model.set(e.target.name.split('[').pop().slice(0, -1), e.target.value);
        },
        'click @ui.delete': function(e) {
            e.preventDefault();
            this.model.destroy();
        }
    },

    templateContext: function() {
        return {
            cid: this.model.cid
        };
    }
});
