# babel-plugin-minify-mangle-properties

Mangle class/object property/method names, as well as global references. The process is designed to match Google Closure Compiler's advanced optimizations mode. This can achieve significantly better minification, especially on large scripts, and is an extra impediment to reverse-engineering code. However it can break code that is not specially written to account for the mangling process; this is described in more detail below.

This plugin is a work in progress. In particular some limitations in the architecture of Babel make it difficult to simply include in your list of plugins to run. See below for more information.

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

Referencing external libraries which the mangler doesn't see can cause errors if the library names are mangled (e.g. `mylibrary.apiCall()` turning in to `mylibrary.A()`. To avoid mangling those names, you can pass a list of names to not mangle in the `reservedNames` plugin option. Alternatively computed or string syntax property accesses are never mangled, e.g. using `mylibrary["apiCall"]()` will not mangle `"apiCall"` and continue to work. (This is the same as how Google Closure Compiler handles external calls.)

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

### All plugin options

`reservedNames`
Array of property names to not be mangled, e.g. "setAttribute", or custom external API names. See `domprops.json` for a default list to pass for scripts used in a browser context.

`identifierPrefix`
String to prefix all mangled names with. By default this is an empty string (so short names are chosen like `A`). For example pass `g_` and the name `A` will instead be mangled to `g_A`. This makes the mangling less effective at minifying the script, but can be useful for diagnosing name collision issues.

`debug`
Boolean to enable debug mode, which mangles names predictably and including the original name, e.g. `foo` -> `_$foo$_`.

`debugSuffix`
String of a suffix to use in debug mode. For example if set to `xyz`, then `foo` will instead mangle to `_$foo$xyz_`.

`randomise`
Boolean to randomise the sequence of characters used when generating mangled names. Defaults to off. When enabled it makes the build non-deterministic, so building the same source twice will use completely different names each time (but not longer or shorter names, just different character choices). This can be a useful obfuscation property.

## Conflicts with other plugins
More than one Babili plugin transform string properties to identifiers, i.e. `o["foo"] -> o.foo`. If this is done before the property mangler sees it, it will be mangled anyway, even though it was written with the intent to not be mangled.

In addition to that, `babel-plugin-minify-mangle-names` mangles local variable names. It makes sure the local variable names it chooses do not collide with global names. However this plugin does not check that mangled global names do not collide with local variable names. This is for two reasons:

* it doesn't need to, as long as you run the property mangler first
* if you mangle a number of separate scripts one after the other, it's not possible to choose global variable names that won't collide with local variables, because the mangler has to choose a name before it's seen all the local variable names. To solve this there would need to be an extra first-pass over all your scripts to collect all local variable names in use across all scripts; the Babel architecture doesn't really have a good way to do this.

To fix these problems, you have to make two passes when using the property mangler. E.g. make two `transform` calls, the first to do property mangling only, and the second to do the remaining minification procedures. This ensures quoted property accesses are mangled as intended, and that global names don't collide with local names.