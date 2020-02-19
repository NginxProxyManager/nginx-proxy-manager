const Mn       = require('backbone.marionette');
const App      = require('../../main');
const template = require('./delete.ejs');

module.exports = Mn.View.extend({
    template:  template,
    className: 'modal-dialog',

    ui: {
        form:    'form',
        buttons: '.modal-footer button',
        cancel:  'button.cancel',
        save:    'button.save'
    },

    events: {

        'click @ui.save': function (e) {
            e.preventDefault();

            App.Api.Nginx.AccessLists.delete(this.model.get('id'))
                .then(() => {
                    App.Controller.showNginxAccess();
                    App.UI.closeModal();
                })
                .catch(err => {
                    alert(err.message);
                    this.ui.buttons.prop('disabled', false).removeClass('btn-disabled');
                });
        }
    }
});
