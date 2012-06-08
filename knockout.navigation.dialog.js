(function () {
    var dialog, subscriptions = [], bindingContext = { model: ko.observable() };
    var isOpen = ko.observable(false);

    ko.navigation.defaultDialogOptions = {};

    ko.navigation.currentDialog = ko.computed(function () {
        return isOpen() ? bindingContext.model() : undefined;
    });

    ko.navigation.showDialog = function (viewModel, options) {
        options = options || {};
        bindingContext.model(viewModel);

        while (subscriptions.length > 0) {
            subscriptions.pop().dispose();
        }

        if (!dialog) {
            dialog = $('<div data-bind="template: model"></div>').dialog({
                autoOpen: false,
                close: function () { isOpen(false); }
            });

            ko.applyBindings(bindingContext, dialog.get(0));
        }

        if (ko.isObservable(viewModel.closed)) {
            subscriptions.push(viewModel.closed.subscribe(function (closed) {
                if (closed) dialog.dialog("close");
            }));
        }

        if (options.title) {
            options.title = options.title;
        } else if (typeof viewModel.title == "string") {
            options.title = viewModel.title;
        } else if (typeof viewModel.title == "function") {
            options.title = viewModel.title();

            if (ko.isObservable(viewModel.title)) {
                subscriptions.push(viewModel.title.subscribe(function (title) {
                    dialog.dialog("option", "title", title);
                }));
            }
        } else {
            options.title = "";
        }

        var dialogOptions = {};
        $.extend(dialogOptions, ko.navigation.defaultDialogOptions, options);

        dialog.dialog("option", dialogOptions);
        dialog.dialog("open");
        isOpen(true);
    };
})();