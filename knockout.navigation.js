// knockout-navigation
// (c) Johnny L. Rancho - https://github.com/jlrancho/knockout-navigation
// License: MIT (http://www.opensource.org/licenses/mit-license.php)

(function () {
    if (!String.prototype.trim) {
        String.prototype.trim = function () {
            return this.replace(/^\s+|\s+$/g, "");
        };
    }

    var historyGetIdByUrl = History.getIdByUrl;
    History.getIdByUrl = function (url) {
        // Fixes issues with encoded urls in Firefox and Chrome
        return historyGetIdByUrl(decodeURI(url));
    };

    var navigation = ko.navigation = {};
    var namespace = window;
    var uniqueId = 0;
    var shellInstanceExists = false;

    function getUniqueId() {
        return uniqueId++ + "" + (new Date()).getTime();
    }

    navigation.parseQueryString = function (url) {
        if (url.indexOf("?") < 0) {
            return {};
        }

        var query = url.substring(url.lastIndexOf("?") + 1);
        var result = {};
        var chunks = query.split("&");

        for (var i = 0, length = chunks.length; i < length; i++) {
            var pair = chunks[i];
            var tokens = pair.split("=");

            if (tokens.length === 2 && tokens[0] != "s" && tokens[0] != "_suid") {
                var decodedValue = decodeURIComponent(tokens[1]);

                if (!isNaN(decodedValue)) {
                    result[tokens[0]] = Number(decodedValue);
                } else if (!isNaN(new Date(decodedValue))) {
                    result[tokens[0]] = new Date(decodedValue);
                } else if (decodedValue.toLowerCase() === "true") {
                    result[tokens[0]] = true;
                } else if (decodedValue.toLowerCase() === "false") {
                    result[tokens[0]] = false;
                } else {
                    result[tokens[0]] = decodedValue; // Just a string
                }
            }
        }

        return result;
    };

    navigation.formatQueryString = function (parameters) {
        var queryString = "";

        for (var property in parameters) {
            if (parameters.hasOwnProperty(property)) {
                if (parameters[property] instanceof Date) {
                    var d = parameters[property];
                    queryString += "&" + property + "=" + (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
                } else if (typeof parameters[property] in { "boolean": 1, "number": 1, "string": 1 }) {
                    queryString += "&" + property + "=" + encodeURIComponent(parameters[property]);
                }
            }
        }

        return queryString;
    }

    navigation.setNamespace = function (ns) { namespace = ns; }

    navigation.getTypeName = function (viewModel) {
        if (viewModel.typeName) {
            return viewModel.typeName;
        }

        if (viewModel.constructor.typeName) {
            return viewModel.constructor.typeName;
        }

        for (name in namespace) {
            if (namespace[name] === viewModel.constructor) {
                viewModel.constructor.typeName = name;

                return name;
            }
        }

        return null;
    };

    navigation.createViewModel = function (typeName, parameters) {
        if (!typeName || !(typeName in namespace)) return null;

        try {
            var viewModel = new namespace[typeName](parameters);

            // Only allow if it was really intended to be bookmarkable
            if (!viewModel.bookmarkable) return null;
            return viewModel;
        } catch (ex) {
            // I hate swallowing exceptions, but attempting to restore the state of the 
            // application through url parameters should be flexible as applications 
            // change over time and we don't want old urls breaking the app.
            //debugger;
            return null;
        }
    };

    navigation.typeToViewName = function (typeName) {
        var template = typeName.replace("Model", "");

        // Don't require template to exist.  Will be the case when using External Template Engine
        //if (!document.getElementById(template)) {
        //    throw new Error("Can't find a view template named " + template);
        //}

        return template;
    };

    navigation.resolveView = function (viewModel) {
        if (!viewModel) return null;

        if (viewModel.viewName) {
            return viewModel.viewName;
        }

        var typeName = navigation.getTypeName(viewModel);
        if (!typeName) {
            throw new Error("In order resolve a view from a view model instance the object " +
            "must either have a constructor function defined on the namespace specified with " +
            "ko.navigation.setNamespace(ns) or must provide a viewName property.");
        }

        return navigation.typeToViewName(typeName);
    }

    navigation.transition = {
        "default": function (fromElement, toElement, navigationType) {
            if (fromElement) { // fromElement won't be set for initial item
                fromElement.style.display = "none";
            }
            toElement.style.display = "block";
        }
    };

    // NavigationModel constructors
    navigation.NavigationModel = function (options) {
        var self = this;
        var options = options || {};
        this.navigationStack = ko.observableArray([]);
        this.currentItem = ko.observable();

        if (options.defaultViewModel) {
            self.navigationStack.push(options.defaultViewModel);
            self.currentItem(options.defaultViewModel);
        }

        this.canGoBack = ko.computed(function () {
            var stack = self.navigationStack();

            return (stack.length > 0 && stack[0] != self.currentItem());
        });

        this.canGoForward = ko.computed(function () {
            var stack = self.navigationStack();

            return (stack.length > 0 && stack[stack.length - 1] != self.currentItem());
        });

        this.back = function () {
            if (self.canGoBack()) {
                var currentIndex = self.navigationStack.indexOf(self.currentItem());
                var nextItem = self.navigationStack()[currentIndex - 1];
                self.currentItem(nextItem);
            }
        };

        this.forward = function () {
            if (self.canGoForward()) {
                var currentIndex = self.navigationStack.indexOf(self.currentItem());
                var nextItem = self.navigationStack()[currentIndex + 1];
                self.currentItem(nextItem);
            }
        };

        this.navigateTo = function (viewModel) {
            var currentItem = self.currentItem();
            var stack = self.navigationStack();

            if (currentItem && stack.length > 0) {
                var lastItem = stack[stack.length - 1];

                if (currentItem !== lastItem) {
                    // navigating should truncate any items in the forward stack
                    var index = self.navigationStack.indexOf(currentItem);
                    stack.length = index + 1;
                }
            }

            self.navigationStack.push(viewModel);
            self.currentItem(viewModel);
        };
    };

    navigation.ShellNavigationModel = function (options) {
        if (shellInstanceExists) {
            throw new Error("There can only be one instance of the ShellNavigationModel.");
        }

        shellInstanceExists = true;

        var self = this;
        var options = options || {};
        var expiredViewModel = options.expiredViewModel;

        this.navigationStack = ko.observableArray([]);

        // Use 2 values here so that the currentItem can be 
        // set to a transient item without losing the pointer 
        // into the navigation stack
        var transientItem = ko.observable();
        var persistentItem = ko.observable();

        this.currentItem = ko.dependentObservable(function () {
            return transientItem() || persistentItem();
        });

        // History.js has a stateId but we can't get access to it 
        // directly after calling pushState but before statechange.
        var stateId = getUniqueId();
        var newUrl = History.emulated.pushState ? "?s=" + stateId : "?";
        var parameters = navigation.parseQueryString(document.URL);
        var viewModel = navigation.createViewModel(parameters.screen, parameters);

        if (viewModel) {
            var queryString = navigation.formatQueryString(parameters);
            if (!History.emulated.pushState) {
                queryString = queryString.substr(1); // Remove the leading '&'
            }

            newUrl = newUrl + queryString;
        } else if (options.defaultViewModel) {
            viewModel = (
            // Support using a factory/accessor function or a view model itself as the default
                (typeof options.defaultViewModel == "function") ?
                options.defaultViewModel() :
                options.defaultViewModel
            );
        }

        if (viewModel) {
            viewModel.stateId = stateId;
            self.navigationStack.push(viewModel);
            persistentItem(viewModel);

            History.replaceState({ stateId: stateId }, null, newUrl);
        }

        this.canGoBack = ko.computed(function () {
            var stack = self.navigationStack();

            return (stack.length > 0 && stack[0] != persistentItem());
        });

        this.canGoForward = ko.computed(function () {
            var stack = self.navigationStack();

            return (stack.length > 0 && stack[stack.length - 1] != persistentItem());
        });

        this.back = function () {
            if (self.canGoBack()) History.back();
        };

        this.forward = function () {
            if (self.canGoForward()) History.forward();
        };

        // Todo - allow options - transient etc
        this.navigateTo = function (viewModel) {
            var stateId = getUniqueId();

            // I did a lot of testing in IE.  It made me cry a couple of times.
            // It seems to need unique url's, hence the s=stateId parameter.
            var newUrl = History.emulated.pushState ? "?s=" + stateId : "?";

            if (viewModel.bookmarkable) {
                // Then we need to modify the url and we have to have a typeName
                var typeName = navigation.getTypeName(viewModel);
                if (!typeName) {
                    throw new Error("Can't determine the typeName for view model.");
                }

                newUrl += (History.emulated.pushState ? "&" : "") + "screen=" + typeName;

                if (viewModel.parameters) {
                    newUrl += navigation.formatQueryString(viewModel.parameters);
                }
            }

            if (persistentItem()) {
                var stack = self.navigationStack();
                var lastItem = stack[stack.length - 1];

                if (persistentItem() !== lastItem) {
                    // navigating should truncate any items in the forward stack
                    var index = self.navigationStack.indexOf(persistentItem());
                    stack.length = index + 1;
                }

                // If we are pushing a new state from a transient state it is most likely
                // because we are out of sync with the browser state.  We use replaceState
                // to sync us back up with the last known state.  For the scenario where you 
                // go back to an expired state then navigate somewhere else you might expect
                // the one item in your forward stack to be removed.  This will not be the
                // case.  There is no way of knowing how the browser got to its current state.
                // This is the most reasonable thing I can think to do.
                if (transientItem()) {
                    History.replaceState({ stateId: persistentItem().stateId }, null, newUrl);
                }
            }

            if (options.maxStackSize && self.navigationStack().length >= options.maxStackSize) {
                // This should usually be 1, but just in case items got in the stack some other way
                var numberToRemove = self.navigationStack().length - options.maxStackSize + 1;

                // Not using ko splice to reduce notifications, will notify below
                self.navigationStack().splice(0, numberToRemove);
            }

            viewModel.stateId = stateId;
            self.navigationStack.push(viewModel);

            History.pushState({ stateId: viewModel.stateId }, null, newUrl);
        }

        History.Adapter.bind(window, "statechange", function () {
            var stateId = History.getState().data.stateId;

            var viewModel = ko.utils.arrayFirst(self.navigationStack(), function (vm) {
                return (vm.stateId && vm.stateId == stateId);
            });

            if (viewModel && viewModel.expired) {
                self.navigationStack.remove(viewModel);
                viewModel = null;
            }

            if (viewModel) {
                persistentItem(viewModel);
                transientItem(null);
            } else if (expiredViewModel) {
                transientItem(expiredViewModel);
            }
        });
    }

    // binding handlers
    var autoResolveDomDataKey = "__ko_autoResolve__";
    var koTemplateBindingHandler = ko.bindingHandlers["template"];

    ko.bindingHandlers["template"] = {
        "init": function (element, valueAccessor) {
            var bindingValue = ko.utils.unwrapObservable(valueAccessor());
            var autoResolve = (
                typeof bindingValue != "string" &&
                !bindingValue.name &&
                element.nodeType == 1 &&
                element.innerHTML.trim() == "" // Don't want to consider whitespace as a template
            );

            // if there is no template name or anonymous template then we will auto resolve it
            ko.utils.domData.set(element, autoResolveDomDataKey, autoResolve);

            return koTemplateBindingHandler["init"](element, valueAccessor);
        },
        "update": function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var accessor = function () {
                var bindingValue = ko.utils.unwrapObservable(valueAccessor());
                var autoResolve = ko.utils.domData.get(element, autoResolveDomDataKey);

                if (autoResolve) {
                    return {
                        name: navigation.resolveView,
                        data: bindingValue
                    };
                }

                return bindingValue;
            };

            koTemplateBindingHandler["update"](element, accessor, allBindingsAccessor, viewModel, bindingContext);
        }
    };

    ko.bindingHandlers["navigation"] = {
        "init": function (element, valueAccessor) {
            var bindingValue = ko.utils.unwrapObservable(valueAccessor());

            if (!bindingValue.currentItem || !bindingValue.navigationStack) {
                throw new Error("The navigation binding expects an object with 'currentItem' and "
                + "'navigationStack' properties passed directly or in the data property of a config object.");
            }

            if (element.nodeType == 1 && element.innerHTML.trim() != "") {
                var trimmedHTML = element.innerHTML.trim();
                var nodes = ko.utils.parseHtmlFragment(trimmedHTML);

                if (nodes.length != 1) {
                    throw new Error("The navigation item layout template should have one and only one top level element.");
                }

                // Can't use this.  ko.utils.emptyDomNode is not exported, breaks on minified version of ko
                //new ko.templateSources.anonymousTemplate(element).text(trimmedHTML);
                //ko.utils.emptyDomNode(element);

                element.innerHTML = trimmedHTML;
                return ko.bindingHandlers["template"]["init"](element, valueAccessor);
            }

            // Else its empty, we will provide a default template
            var defaultTemplate = '<div data-bind="template: $data" style="display: none"></div>';
            new ko.templateSources.anonymousTemplate(element).text(defaultTemplate);

            return { "controlsDescendantBindings": true };
        },
        "update": function (element, valueAccessor, allBindingsAccessor, parentViewModel, bindingContext) {
            var accessor = function () {
                var bindingValue = valueAccessor();
                var allBindings = allBindingsAccessor();
                var transitionKey = allBindings["transitionKey"] || "default";
                var currentElement = null;
                var currentViewModel = null;
                var transientItems = ko.observableArray();

                // Its important that during a normal navigation that the item is pushed onto the
                // navigation stack before setting the current item otherwise it will be considered
                // a transient navigation.  The ko.navigation.NavigationModel does this, but if a
                // developer needs to implement their own navigation view model, this is an implicit
                // contract of this binding handler.
                bindingValue.currentItem.subscribe(function (value) {
                    if (bindingValue.navigationStack.indexOf(value) == -1) {
                        transientItems.push(value);
                    }
                });

                var bindingStack = ko.dependentObservable(function () {
                    var combined = bindingValue.navigationStack().concat(transientItems());
                    return ko.utils.arrayGetDistinctValues(combined);
                });

                return {
                    "foreach": bindingStack,
                    "templateEngine": ko.nativeTemplateEngine.instance,
                    "name": element,
                    "afterRender": function (nodesArray, viewModel) {
                        var thisElement = nodesArray[0];

                        ko.dependentObservable({
                            read: function () {
                                if (bindingValue.currentItem() === viewModel && currentViewModel !== viewModel) {
                                    var navigationType;
                                    var fromTransient = transientItems.indexOf(currentViewModel) != -1;
                                    var toTransient = transientItems.indexOf(viewModel) != -1;

                                    // Man there sure is alot of detail in these different transition types.  Probably
                                    // alot more than anyone cares.  But someone, somewhere, one day will say, Yes! I was
                                    // hoping I could animate the ToTransient state!  This sir, is for you.  Your welcome :-)
                                    if (currentElement === null) {
                                        navigationType = "Initial";
                                    } else if (fromTransient && toTransient) {
                                        navigationType = "Transient";
                                    } else if (fromTransient) {
                                        navigationType = "FromTransient";
                                    } else if (toTransient) {
                                        navigationType = "ToTransient";
                                    } else {
                                        var currentIndex = bindingValue.navigationStack.indexOf(currentViewModel);
                                        var newIndex = bindingValue.navigationStack.indexOf(viewModel);
                                        var jump = newIndex - currentIndex;

                                        if (jump == 1) {
                                            navigationType = "Forward";
                                        } else if (jump == -1) {
                                            navigationType = "Back";
                                        } else if (jump > 1) {
                                            navigationType = "JumpForward";
                                        } else if (jump < -1) {
                                            navigationType = "JumpBack";
                                        }
                                    }

                                    ko.navigation.transition[transitionKey](currentElement, thisElement, navigationType);

                                    var tempCurrentItem = currentViewModel;
                                    currentViewModel = viewModel;
                                    currentElement = thisElement;

                                    // Changing transientItems will trigger a re-evaluation of this
                                    // function. Have to make sure currentViewModel is updated first
                                    // so that we don't inadvertantly fire extra wrong transitions.
                                    if (fromTransient) {
                                        transientItems.remove(tempCurrentItem);
                                    }
                                }
                            },
                            disposeWhenNodeIsRemoved: thisElement
                        });
                    }
                };
            };

            return ko.bindingHandlers["template"]["update"](element, accessor, allBindingsAccessor, parentViewModel, bindingContext);
        }
    };
})();