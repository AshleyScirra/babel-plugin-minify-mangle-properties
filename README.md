# babel-plugin-minify-mangle-properties

Mangle class/object property/method names, as well as global references. This can achieve significantly better minification, especially on large scripts, and is an extra impediment to reverse-engineering code. However it can break code that is not specially written to account for the mangling process; this is described in more detail below.

### Basic functionality
```
let o = {
    foo: 1
};
console.log(o.foo);
```
transforms to:
```
let o = {
    A: 1
};
console.log(o.A);
```

Methods are also mangled, e.g.:

```
class C {
    MyMethod() { console.log("Hello world!"); }
};
new C().MyMethod();
```
transforms to:
```
class C {
    A() { console.log("Hello world!"); }
};
new C().A();
```

Referencing external libraries which the mangler doesn't see can cause errors if the library names are mangled (e.g. `mylibrary.apiCall()` turning in to `mylibrary.A()`. To avoid mangling those names, you can pass a list of names to not mangle in the `reservedNames` plugin option. Alternatively computed or string syntax property accesses are never mangled, e.g. using `mylibrary["apiCall"]()` will not mangle `"apiCall"` and continue to work.

To avoid mangling DOM API calls used in a browser enviornment (e.g. `setAttribute`), this repo includes `domprops.json` based on the list from UglifyJS that you can pass to `reservedNames`.

### Global reference mangling

The property mangler also mangles global references. This is because one way of defining a global variable is to use a property access, e.g.:
```
window.foo = {};    // property "foo" mangled
foo.bar = 1;        // must also mangle "foo" here
console.log(foo);   // and here
```
This case would be transformed to:
```
window.A = {};
A.B = 1;
console.log(A);
```
Note currently globals defined with `var` are not considered.

The mangler does not have to see a global definition first. If you simply use `foo.bar = 1`, and `foo` does not refer to a local variable, `foo` is still mangled. This saves you from having to mangle your scripts in the right order (since otherwise you would have to mangle the script that said `window.foo = ...` first). The only exceptions to this are the terms `window`, `self`, `global` and `exports` (currently hard-coded), in which case only the property is mangled.

### Debug mode
It is very difficult to work with mangled code if you find it doesn't work any more after mangling. To help diagnose problems, there is a `debug` option you can enable to mangle names predictably. In debug mode, `o.foo` mangles to `o._$foo$_`. This means code is still readable after mangling, but the property names have still been altered to reproduce any bugs caused by mangling. This can turn errors like "cannot call A on undefined" in to "cannot call `_$myApiCall$_` on undefined". This makes the next step obvious: locate references to `o.myApiCall()`, and ensure you use `o["myApiCall"]()` syntax instead - or add "myApiCall" to the reserved names list.

You may also specify a `debugSuffix` option which adds a custom string in to the debug mangled name. For example setting a debug suffix of "xyz" will cause `o.foo` to mangle to `o._$foo$xyz_`. One technique is to ensure every script is mangled with a random number in the suffix. This helps identify if separate scripts are being mangled independently of each other, which may cause the same property name to mangle to two different names and break things. When scripts are mangled together the mangler ensures that the same property name always mangles the same way.

(Note: "mangled together" means sharing a name cache between scripts; currently this is not supported because I can't find a way to share objects between plugin calls (**TODO**). Instead there is a hack where it always uses the same name cache defined at the top level of the babel plugin.)

### Name collisions with babel-plugin-minify-mangle-names
Currently there is no integration with `babel-plugin-minify-mangle-names`, which only mangles local variable names. This could cause awkward name collision issues such as:
```
window.myGlobal = 1;
function test(param) {
    return param + myGlobal;
};
```
mangling to:
```
window.A = 1;
function test(A) {
    return A + A;   // oops, doesn't reference myGlobal any more
};
```
There are a few ways to avoid this, but the simplest is to ensure the two name manglers use different namespaces. To this end, the property mangler always starts mangled names with an uppercase character, with the intent that the name mangler is modified to always start mangled names with a lowercase character. This rules out name collisions between the two. It is possible to implement a more sophisticated analysis, but this could be very difficult to implement correctly.

### Conflicts with other property transforms
More than one Babili plugin transform string properties to identifiers, i.e. `o["foo"] -> o.foo`. If this is done before the property mangler sees it, it will be mangled anyway, even though it was written with the intent to not be mangled.

Babel lacks a way to ensure any particular plugin runs first. The only way to ensure this is to run two passes, e.g. make two `transform` calls, the first to do property mangling only, and the second to do the remaining minification procedures. This also has the benefit that writing `o["foo"]` does not mangle "foo" and still outputs the shorter `o.foo`.