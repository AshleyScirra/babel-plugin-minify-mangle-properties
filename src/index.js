"use strict";

// TODO: make caller provide this so the caller can control which scripts share name mangling dictionaries.
// Currently this forces all invocations of the plugin from the same process to share the same dictionary.
// Babel appears to do some kind of clone on the plugin options so passing it there doesn't work.
let globalNameCache = {
	nameMap: new Map(),
	seed: 0
};

// Mangled identifiers must begin with one of FIRST_CHARS, then any later chars can be any of NEXT_CHARS.
// By making all mangled identifiers start with an uppercase character, and assuming the name mangler uses
// a lowercase first character, we guarantee that mangled global variable references never collide with locals.
const FIRST_CHARS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const NEXT_CHARS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"];

// Generate a new identifier from the given seed (which increments every time we want a new identifier).
function generateIdentifierFromSeed(s)
{
	// generate first char
	let s1 = s % FIRST_CHARS.length;
	let ret = FIRST_CHARS[s1];
	s = Math.floor((s - s1) / FIRST_CHARS.length);
	
	while (s > 0)
	{
		let s2 = (s - 1) % NEXT_CHARS.length;
		ret += NEXT_CHARS[s2];
		s = Math.floor((s - (s2 + 1)) / NEXT_CHARS.length);
	}
	
	return ret;
};

// Generate a mangled name. In debug mode this returns a string of the form: _$name$suffix_
// In non-debug mode a short and unreadable name from generateIdentifierFromSeed is used.
function generateMangledName(name, o)
{
	if (o.isDebugMode)
	{
		return "_$" + name + "$" + o.debugSuffix + "_";
	}
	else
	{
		return generateIdentifierFromSeed(o.nameCache.seed++);
	}
};

// Return a mangled name from a given property name.
function mangleName(name, o)
{
	// Don't mangle names in the reserved names list or global alias list.
	if (o.reservedNames.has(name) || o.globalAliases.has(name))
		return name;
	
	// Return from the name map if we have already mangled this name.
	let nameMap = o.nameCache.nameMap;
	let mangledName = nameMap.get(name);
	
	if (mangledName)
		return mangledName;
	
	// Otherwise this is the first time we are mangling this name.
	// Generate the mangled name and save it in the name map for next time.
	mangledName = generateMangledName(name, o);
	nameMap.set(name, mangledName);
	return mangledName;
};

// Mangle an identifier node by replacing its name with a mangled name
function mangleNode(node, o)
{
	// Don't mangle nodes more than once
	if (o.alreadyMangledNodes.has(node))
		return;
	
	node.name = mangleName(node.name, o);
	o.alreadyMangledNodes.add(node);
};

module.exports = function (_ref)
{
	var t = _ref.types;

	return {
		name: "minify-mangle-properties",
		pre(state) {
			// List of reserved names provided in options (if any)
			this.reservedNames = null;
			
			// List of terms to recognise as aliasing global scope. Used to avoid mangling "window" in "window.foo".
			this.globalAliases = new Set(["window", "self", "global", "exports"]);
			
			// Use debug name mangling to diagnose mangling errors with a custom suffix.
			this.isDebugMode = false;
			this.debugSuffix = "";
			
			// Name cache to ensure multiple scripts mangle the same way as { nameMap, seed }
			this.nameCache = null;
			
			// Set of nodes already mangled so we don't mangle anything twice
			this.alreadyMangledNodes = new Set();
		},
		visitor:
		{
			Program(path, state)
			{
				// Read options from state. TODO: figure out why this doesn't work in pre()
				this.alreadyMangledNodes.clear();
				this.reservedNames = new Set(state.opts.reservedNames || []);
				this.isDebugMode = !!state.opts.debug;
				
				if (this.isDebugMode)
					this.debugSuffix = state.opts.debugSuffix || "";
				
				// TODO: find a way for caller to provide
				this.nameCache = globalNameCache;
			},
			
			ObjectProperty(path)
			{
				let { node } = path;
				
				if (node.key.type !== "Identifier")
					return;
				
				// turn off shorthand since the property name will be mangled to something different,
				// but we want to use the same property value
				// e.g. { foo } -> { _$foo$_: foo }
				node.shorthand = false;

				mangleNode(node.key, this);
			},
			
			MemberExpression(path)
			{
				let { node } = path;

				if (node.property.type !== "Identifier")
					return;
				
				// ignore computed o[foo] syntax, only mangle o.foo syntax
				if (node.computed)
					return;		
				
				// If left side is an identifier, check for global references
				if (node.object.type === "Identifier")
				{
					// If the left side of the dot is either a local variable reference or a global alias, only mangle the right hand side.
					// This means with `let o = {}; o.foo = 1` and `window.foo = 1`, only "foo" is mangled.
					if (path.scope.hasBinding(node.object.name) || this.globalAliases.has(node.object.name))
					{
						mangleNode(node.property, this);
					}
					// The left side is a global reference: mangle both sides. This means if we see `foo.bar` and know "foo" isn't a local
					// variable or global alias, we mangle the left side as a global reference, and the right side as per usual.
					else
					{
						mangleNode(node.property, this);
						mangleNode(node.object, this);
					}
				}
				// if anything else is on the left side (this.foo, obj.prop.foo, (new Cake()).foo etc), mangle just the right side.
				else
				{
					mangleNode(node.property, this);
				}
			},
			
			ClassMethod(path)
			{
				let { node } = path;

				mangleNode(node.key, this);
			},
			
			ObjectMethod(path)
			{
				let { node } = path;

				mangleNode(node.key, this);
			},
			
			Identifier(path)
			{
				let { node } = path;
				
				// don't mangle identifiers in meta-properties like new.target
				if (path.parent && path.parent.type === "MetaProperty")
					return;
				
				// don't mangle local variable references
				if (path.scope.hasBinding(node.name))
					return;
				
				mangleNode(node, this);
			}
		}
	}
};
