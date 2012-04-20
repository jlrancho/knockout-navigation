

**knockout-navigation** is a simple plugin for [Knockout.js](http://knockoutjs.com/) that allows view model first navigation using convention over configuration in the spirit of the WPF/Silverlight framework [Caliburn Micro](http://www.caliburnproject.org/).

The idea being that the application dynamically selects the view to display based on the view model rather than having to manually match the two up.  This helps simplify application logic and increases testability by focusing on interactions between models instead of dealing with specific UI elements.  Navigation is a good candidate for this pattern but a convention over configuration approach can help other areas where rich composition of UI parts is needed.

**knockout-navigation** consists of the following pieces:

* **Updated template binding** - dynamically selects the view based on conventions for rendering template's and foreach's.
* **NavigationModel and ShellNavigationModel** - provides logical navigation stacks and associated behaviors from which to bind in your UI.  ShellNavigationModel uses [History.js](https://github.com/balupton/History.js/) to integrate with browser navigation.
* **Navigation binding** - designed to bind to a NavigationModel. Handles rendering the correct view for the current item in the navigation stack as well as extension points for coordinating transitions.
* **Optional ASP.NET MVC HtmlHelper** - If you are using MVC this is a small helper for including views defined in separate files.

**JS Fiddles**

* [Basic Usage Example](http://jsfiddle.net/jlrancho/Dg9cE/)
* [Transitions Example](http://jsfiddle.net/jlrancho/C8Tmw/)

**Basic Usage**

```js
var MyApp = window.MyApp = {}; // Define application namespace
ko.navigation.setNamespace(MyApp); // Let ko.navigation know where to look

MyApp.Screen1Model = function () {...}; // Define view model constructors
MyApp.Screen2Model = function () {...};

MyApp.ShellModel = function () {  // We will do ko.applyBindings on the ShellModel
    var self = this;
    this.navigation = MyApp.navigation = new ko.navigation.ShellNavigationModel({ 
		// Will sync with browser state, also store a reference in MyApp.navigation for easy access from other view models
        defaultViewModel: new MyApp.Screen1Model(), // The vm to initialize with, can either be an instance or factory/accessor function
        expiredViewModel: { viewName: "ExpiredItem" }, // The vm to display when user tries to navigate to unknown browser state
        maxStackSize: 20 // Expire items after a certain point to cap memory usage
    });

    this.GoToScreen1 = function () { // View model navigation
        self.navigation.navigateTo(new MyApp.Screen1Model());
    };

    this.GoToScreen2 = function () {
        self.navigation.navigateTo(new MyApp.Screen2Model());
    };
};
```

```html
<script type="text/html" id="Screen1">...</script>
<script type="text/html" id="Screen2">...</script>
<script type="text/html" id="ExpiredItem">...</script>
...
<div class="content" data-bind="navigation: navigation"><div>
```

**Conventions**

The conventions for resolving a view name (ko template id) from a given view model instance are:

1. We assume most of the view models will be created from a constructor function in some namespace.  ko.navigation will search that namespace when trying to resolve the type name of an instance*.    This is then translated into a view name by simple convention.  By default this is just removing the 'Model' part of the name.  So if your view model is named 'Screen1Model' it will look for a view named 'Screen1'.  This will also work if you prefer to use 'View' in your naming. So 'Screen1ViewModel' will become 'Screen1View'.  To plug in your own conventions you can override ko.navigation.typeToViewName(typeName).

2. If a view model doesn't have a constructor in your namespace you can provide a viewName property. Ex: expiredViewModel in the sample above.  You can also override ko.navigation.resolveView(viewModel) if you need full control over how to resolve a view from a view model instance.

*Once a constructor is found it is tagged for fast lookups on subsequent searches.

**Template Binding**

This is a minor update to the standard template binding.  If your binding expression is not a string, and doesn't specify a name, and the target element doesn't contain an anonymous template, then it will use the ko.navigation.resolveView function to select the view per the conventions described above.  Otherwise it will be identical behavior.

**NavigationModel and ShellNavigationModel**

A NavigationModel is an object with the following structure:

```js
{
    navigationStack: ko.observableArray(),
    currentItem: ko.observable(),
    navigateTo: function (viewModel) {...},
    back: function () {...},
    forward: function () {...},
    canGoBack: ko.computed(function() {...}),
    canGoForward: ko.computed(function() {...})
};
```

By using the navigateTo method you push view model instances onto the navigationStack and set the currentItem property.  Your UI can then bind to this object and display the current item while preserving the UI state of items in the back stack.

**ShellNavigationModel**

The ShellNavigationModel has all the same features but was designed to synchronize with the browser state using History.js and allows bookmarking and restoring view model state from query string parameters.

**BookMarkability**

In order for a view model to be bookmarked it must provide a bookmarkable = true property.  If that view model needs values passed to its constructor for initialization then it will need to provide a parameters property as well so that those values can be serialized into the query string.  For example, if you wanted to support bookmarkability on your customer details view model, which needs to be initialized with a customer id, you could do something like:

```js
MyApp.CustomerDetailsModel = function (parameters) {
    this.bookmarkable = true;
    this.parameters = parameters;

    this.customerId = parameters.id;
    ...
}

// Some other place
MyApp.navigation.navigateTo(new MyApp.CustomerDetailsModel({ id: 1 }));
```

Now if the user bookmarks this, the url will contain: ?screen=CustomerDetailsModel&id=1.  When the user later brings up this url from the bookmark, the ShellNavigationModel will construct the CustomerDetailsModel with an id of 1 instead of displaying the defaultViewModel.

**Expired Items**

There are several reasons why the browser state can be out of sync with the ShellNavigationModel.  The most common being that the user has used the refresh button which effectively restarts the application.  Any entries in the browsers back stack will no longer be present in the models navigation stack.  Another reason is items that are past the specified maxStackSize.  Whenever the user tries to navigate to one of these entries the expiredViewModel, if set, will be displayed.  You can manually expire a view model instance by giving it an expired = true property.  The next time it is navigated to it will be removed from the stack and the expiredViewModel displayed instead.

**Navigation Binding**

The navigation binding was designed to work well with the NavigationModels, however you can bind it to any object that has a navigationStack and currentItem properties.  This binding is basically a foreach binding that displays only the current item with some extra niceties.  The simplest usage of the binding looks like this:

```html
<div data-bind="navigation: navigation"></div>
```

Using it this way, it will create an item template for you that that is effectively this:

```html
<div data-bind="navigation: navigation">
	<div data-bind="template: $data" style="display: none"></div>
<div>
```

Where the navigation binding will render the inner div for each item in the bound navigation stack setting only the current item visible, and the updated template binding will display the data per convention.

You may want to use your own inline item template if you need to control styles and css or just want a common layout to wrap each item.  For example, if each of your view models will have title property you could use something like the following:

```html
<div class="content" data-bind="navigation: navigation">
	<div>
        <h2 data-bind="text: $data.title"></h2>

        <div class="screen" data-bind="template: $data"></div>
	<div>
</div>
```

The only requirement is that the item template contain only one top level element  (The wrapping div in this case).  This is needed in order to support transitions.

**Transitions**

By default, the navigation binding will transition between items by simply setting style.display on the element, immediately hiding and showing items.  Transitions themselves are out of scope for this library, but are easy to plug in yourself by defining a transition function off of the ko.navigation.transition object.  Here is the default:

```js
ko.navigation.transition = {
    "default": function (fromElement, toElement, navigationType) {
        if (fromElement) { // fromElement won't be set for initial item
            fromElement.style.display = "none";
        }
        toElement.style.display = "block";
    }
};
```

To support your own transitions you can override the default.  You will want to animate the fromElement out and the toElement in according to the navigationType.  The navigation binding will detect the following navigation types: 

* "Initial" - When the first item is displayed
* "Forward" - Going one item forward in the stack
* "Back" - Going one item back in the stack
* "JumpForward" - Going more than one item forward in the stack
* "JumpBack" - Going more than one item back in the stack 
* "FromTransient" - When going from a transient* to a non-transient item
* "ToTransient" - When going from a non-transient to a transient item
* "Transient" - When going from a transient to another transient item

*An item is considered transient if the navigation binding does not find the current item in the stack.  For example the expiredViewModel will be transient.  This distinction is needed because it is impossible to know how a user navigated to a transient item; we don't know if they went forward or backward or jumped to it etc.

Of course you don't have to handle all of these navigation types, only forward and back are what most people will care about.  But, the info is there in case you need it.

Here is an example showing how to plug in your own transitions.  This is using [Steve Sanderson's panes.js](http://blog.stevensanderson.com/2011/10/12/full-height-app-layouts-animated-transitions-within-panes/) library and has a dependency on [XUI](http://xuijs.com/).

```js
ko.navigation.transition["default"] = function (fromElement, toElement, navigationType) {
    switch (navigationType) {
        case "Forward":
        case "JumpForward":
            x$(toElement).showPane({ slideFrom: "right" });
            break;
        case "Back":
        case "JumpBack":
            x$(toElement).showPane({ slideFrom: "left" });
            break;
        default:
            x$(toElement).showPane();
    }
};
```

In addition to the default, you can define other transition keys as well.  For example, if you wanted child navigation sections to have a different type of transition you could add a key to the ko.navigation.transition object and then use the transitionKey binding to reference it:

```html
<div data-bind="navigation: navigation, transitionKey: 'someKey'"></div>
```

**MVC HtmlHelper**

If you are using ASP.NET MVC this is a small helper that will allow you to put your views in their own file and at runtime load them into the main html section, wrapping them in script "text/html" tags, and naming them accordingly.  This is really only useful when you have just a handful of views you want statically loaded with the app.  Otherwise, you should probably be using the [External-Template-Engine](https://github.com/ifandelse/Knockout.js-External-Template-Engine).  

To use, include the ClientViewHelper.cs file in your project, then from your main Razor html file add a using directive to import the Knockout namespace.  Then call Html.LoadClientViews specifying the folder where your Razor views are located:

```html
@Html.LoadClientViews("~/Views/Client")
```

**Dependencies**

* Knockout.js 2.0+
* History.js 1.7+

**License**: MIT [http://www.opensource.org/licenses/mit-license.php](http://www.opensource.org/licenses/mit-license.php)