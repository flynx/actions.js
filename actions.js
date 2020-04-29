/**********************************************************************
* 
*
*
**********************************************************************/
((typeof define)[0]=='u'?function(f){module.exports=f(require)}:define)(
function(require){ var module={} // makes module AMD/node compatible...
/*********************************************************************/

var object = require('ig-object')



/*********************************************************************/
// helpers...

// XXX doc...
var doWithRootAction = 
module.doWithRootAction = 
function(func){
	return function(){
		var args = [...arguments]
		var handlers = (this.getHandlerList 
				|| MetaActions.getHandlerList)
			.apply(this, args)
		return func.apply(this, [handlers.pop()].concat(args)) } }



//---------------------------------------------------------------------
// String action parser/runner...
//
// Examples:
// 	'actionName'
// 	'actionName: attr 123 "string" -- comment...'
// 	'actionName: ...'
// 
//
// Syntax:
// 		ALIAS ::= 
// 			<action-name>
// 			| <action-name>: <args>
// 			| <action-name>: <args> <comment>
// 		<args> ::=
// 			<arg>
// 			| <arg> <args>
// 		<arg> ::=
// 			Number|String|Array|Object
// 			IDENTIFIER
// 			| ...
// 			| '$[0-9]'
// 		<comment> ::=
// 			'--.*$'
// 			
// 	Special args:
// 		IDENTIFIER
// 				- expanded to context[IDENTIFIER]
// 		$N		- expanded to an instance of parseStringAction.Argument
// 		...		- expanded to parseStringAction.ALLARGS (singleton)
// 			
// 			
// Returns:
//		{
//			action: action,
//			arguments: args,
//			doc: doc,
//			no_default: no_default,
//			stop_propagation: false,
//
//			code: txt,
//		}
// 		
//
// NOTE: identifiers are resolved as attributes of the context...
// NOTE: this is a stateless object...
// XXX this is the same as ImageGrid's keyboard.parseActionCall(..), reuse	
// 		in a logical manner...

// placeholders...
var __Atom
var __Argument

var parseStringAction =
module.parseStringAction =
Object.assign(
	// parser...
	function(txt){
		// split off the doc...
		var c = txt.split('--')
		var doc = (c[1] || '').trim()
		// the actual code...
		c = c[0].split(':')

		// action and no default flag...
		var action = c[0].trim()
		var no_default = action.slice(-1) == '!'
		action = no_default ? action.slice(0, -1) : action

		// parse arguments...
		var args = ((c[1] || '')
				.match(RegExp([
					// strings...
					'"[^"]*"',
					"'[^']*'",
					'`[^`]*`',

					// objects...
					// XXX hack-ish...
					'\\{[^\\}]*\\}',

					// lists...
					// XXX hack-ish...
					'\\[[^\]]*\]',

					// numbers...
					'\\d+\\.\\d+|\\d+',

					// identifiers...
					'[a-zA-Z$@#_][a-zA-Z0-9$@#_]*',

					// rest args...
					'\\.\\.\\.',

					// null...
					'null',
				].join('|'), 'gm')) 
			|| [])
			.map(function(e){
				// argument placeholder...
				return /^\.\.\.$/.test(e) ?
						parseStringAction.ALLARGS
					: /^\$[a-zA-Z0-9$@#_]*$/.test(e) ?
						new parseStringAction.Argument(e.slice(1))
					// idetifiers...
					// NOTE: keep this last as it is the most general...
					: /^[a-zA-Z$@#_][a-zA-Z0-9$@#_]*$/.test(e) ?
						new parseStringAction.Identifier(e)
					: JSON.parse(e) })

		return {
			action: action,
			arguments: args,
			doc: doc,
			no_default: no_default,
			stop_propagation: false,

			code: txt,
		} }, 

	// API and utils...
	{
		// atoms...
		Atom: (__Atom = object.Constructor('Atom', {
			__init__: function(value){
				this.value = value },
			valueOf: function(){ 
				return this.value },
		})),
		Identifier: object.Constructor('Identifier', 
			Object.create(__Atom.prototype)),
		Argument: (__Argument = object.Constructor('Argument', 
			Object.create(__Atom.prototype))),
		ALLARGS: new __Argument('...'),

		// general API...
		resolveArgs: function(context, action_args, call_args){
			var that = this
			var rest
			var args = [...action_args]
				// merge args...
				.map(function(arg, i){
					return arg instanceof that.Argument ?
						(arg === that.ALLARGS ?
							(function(){
								rest = i
								return arg
							})()
							: call_args[parseInt(arg.value)])
						// resolve idents...
						: arg instanceof that.Identifier ?
							context[arg.value]
						: arg })
			rest != null
				&& args.splice(rest, 1, ...call_args)
			return args },

		// XXX should this break if action does not exist???
		callAction: function(context, action, ...args){
			action = typeof(action) == typeof('str') ? 
				this(action) 
				: action
			// XXX should this break if action does not exist???
			return context[action.action] instanceof Function ? 
				context[action.action]
					.apply(context, this.resolveArgs(context, action.arguments, args))
				// action not found or is not callable... (XXX)
				: undefined },
		applyAction: function(context, action, args){
			return this.callAction(context, action, ...args) },

		// XXX make this stricter...
		isStringAction: function(txt){
			try{
				var parsed = typeof(txt) == typeof('str')
					&& (this.parseStringAction || parseStringAction)(txt)
				return parsed 
					&& /[a-zA-Z_][a-zA-Z0-9_]*/.test(parsed.action)
			} catch(e){
				return false } },
	})

// shorthand...
var isStringAction =
module.isStringAction =
	parseStringAction.isStringAction



/*********************************************************************/
// Action...

// Return value wrapper...
// 
// Wrapping a value in this and returning it from an action will force
// the action to return the value as-is...
// This is mainly usefull for specially handled values.
var ASIS =
module.ASIS = 
object.Constructor('ASIS', {
	__init__: function(obj){ this.value = obj } })

// undefined wrapper...
var UNDEFINED =
module.UNDEFINED = ASIS(undefined)


// Construct an action object...
//
// 	Action(<name>, <function>)
// 	Action(<name>[, <doc>[, <long-doc>]][, <attrs>,] <function>)
// 	Action(<name>[, [<doc>[, <long-doc>]][, <attrs>,] <function> ])
// 		-> <action>
// 	
//
// Action function format:
//
// 		// pre event code...
// 		function(..){
//			... // pre code
// 		}
//
// 		// pre/post event code...
// 		function(..){
//			... // pre code
//			return function(<return>, ..){
//				... // post code
//			}
// 		}
//
//
// An action is essentially a method with several additional features:
//
// 	- actions are split into two stages:
// 		pre: 	the code of the method is executed before the action 
// 				event is fired
// 		post:	if the action returns a callback function it will be 
// 				executed after the event is fired
// 				NOTE: the signature if the post stage is the same as the
// 					action's with the added return value as first argument
// 					(the rest og the arguments are shifted by 1).
//
// 	- actions automatically call the shadowed action, the pre stage is
// 	  executed down-up while the post stage is run in reverse order, 
// 	  i.e. the pre is going down and the post is going up.
//
// 	- actions provide an event-like mechanism to register handlers or 
// 	  callbacks. These callbacks are local to a specific object and will
// 	  be fired on action event/call starting from the current action 
// 	  caller and down the inheritance chain, i.e. all event handlers 
// 	  registered from the current object and up to the base action set
// 	  will be fired.
//
// 	- an action will return the deepest (root) action's return, if that 
// 	  return is undefined, then the action set is returned instead.
// 	  If the root action returns a Promise, then the post phase will be 
// 	  triggerd AFTER that promise is resolved or rejected, this can be 
// 	  disabled by setting the 'await' action attribute to false (see:
// 	  Action.prototype.await for details)
//
// 	- action arguments are "threaded" through the action chain down and 
// 	  root action return value and arguments are threaded back up the 
// 	  action chain.
//
// NOTE: actions once defined do not depend on the inheritance hierarchy, 
// 		other than the .getHandlerList(..) method. If this method is not 
// 		found in the inheritance chain (i.e. the link to MetaActions)
// 		was severed, then the default will be used: 
// 			MetaActions.getHandlerList(..)
// 		This makes it possible to redefine the method if needed but 
// 		prevents the system from breaking when an action set gets 
// 		disconnected from MetaActions. This can be useful, for example,
// 		to remove .on(..) / .off(..) handler functionality.
// 		XXX is this correct??
// NOTE: by default an action will return 'this', i.e. the action set
// 		object the action was called from.
// NOTE: if func.nmae is set to '<action-name>' it will be reset to the 
// 		action name by Action(..). This is a means for extending functions 
// 		to get the specific action name.
// 		Example:
// 			var getActionName = function(func){
// 				var f = function(...args){
// 					return func(f.name, ...args) } 
// 				// this will force Actions(..) to set a name on f
//				Object.defineProperty(f, 'name', { value: '<action-name>' })
// 				return f
// 			}
//
// 			...
//
// 			someAction: [
// 				getActionName(function(name, ...args){
// 					console.log('Action name:', name)
// 				})],
// 			someOtherAction: [
// 				function(name, ...args){
// 					// there is no way to know the action name from within
// 					// and action...
// 				}],
//
// 		But note that the .name is set in definition time and not in 
// 		call time, so renaming the action in runtime will have no effect 
// 		on what it will log...
// 		Also note that using Object.defineProperty(..) is required as 
// 		chrome ignores changes to function's .name in other cases...
// 		
//
// XXX add more metadata/docs:
// 		.section
// 		.category
// 		...
// XXX might be a good idea to add an option to return the full results...
var Action =
module.Action = 
object.Constructor('Action', {
	__proto__: Function,

	// Control how an action handles returned promises...
	// 
	// Possible values:
	// 	true	- if an action returns a promise then trigger the post phase
	// 				after that promise is resolved / rejected... (default)
	// 	false	- handle promises like any other returned value.
	// 	
	// 	
	// NOTE: .await is only checked in the root action, thus it can not be 
	// 		overloaded by extending actions.
	// 		This is done intentionally, as the action actually returning a 
	// 		value (and defining the signature) is the only one responsible 
	// 		for controlling how it's handled.
	// 	
	// For implmentation see: Action.prototype.chainApply(..)
	// 
	// XXX should we be able to set this in the context???
	// XXX can we use 'await'???
	await: true,


	// pre/post stage runners...
	//
	// 	.pre(context, args)	
	// 		-> data
	//
	// 	.post(context, data)
	// 		-> result
	// 		
	// 		
	// Call data format:
	// 	{
	//		arguments: args,
	//
	//		wrapper: call_wrapper,
	//		handlers: handlers,
	//
	//		result: res,
	// 	}
	//
	//
	// External methods (required):
	// 	.getHandlers(..)			resolved from: context, MetaActions
	//
	//
	// External methods (optoinal):
	// 	.__actioncall__(..)			resolved from: context
	// 	.preActionHandler(..)		resolved from: context, MetaActions
	//
	//
	// Special cases:
	// 	- An action is referenced via a different name than is in its .name
	// 		this can occur if:
	// 			1) an action is renamed but its .name is not
	// 			2) an action is created and stored with a different name
	// 				var f = new Action('m', function(){ ... })
	//
	//
	// NOTE: All the defaults should be handled by the pre stage, post will 
	// 		process data assuming that it is correct.
	// NOTE: .post(..) will not wait for returned promises to resolve, use 
	// 		.chainApply(..) / ,chainCall(..) instead, or handle .result 
	// 		manually...
	// 		(see: Action.prototype.chainApply(..))
	// XXX revise the structure....
	// 		...is it a better idea to define action methods in an object 
	// 		and assign that???
	pre: function(context, args){
		var that = this
		args = args || []

		// prepare for after calls...
		// XXX this may pose problems with concurency...
		// XXX do not like that this forces exception rethrowing...
		// XXX EXPERIMENTAL (after calls)...
		context.__action_after_running = [
			// nested call...
			context.__action_after_running,
			// top list...
			(context.__action_after_running || [null, []])[1],
		]

		var res = context
		var outer = this.name

		// get the handler list...
		var getHandlers = context.getHandlers 
			|| MetaActions.getHandlers
		var handlers = getHandlers.call(context, outer)

		// handle cases where .func is not in handlers...
		//
		// NOTE: see Special cases in method doc above...
		if(handlers.length == 0 
				|| handlers.filter(function(h){ 
					return h.pre === that.func }).length == 0){
			var cur = {
				pre: this.func,
			}
			this.doc
				&& (cur.doc = this.doc)
			this.long_doc
				&& (cur.long_doc = this.long_doc)
			handlers.unshift(cur)
		}

		// special case: see if we need to handle the call without handlers...
		var preActionHandler = context.preActionHandler 
			|| MetaActions.preActionHandler
		if(preActionHandler){
			var res = preActionHandler.call(context, outer, handlers, args)
			if(res !== undefined){
				return res } }

		var call_wrapper = outer != '__actioncall__' ? 
			getHandlers.call(context, '__actioncall__') 
			: []

		try {
			// wrapper handlers: pre phase...
			call_wrapper = call_wrapper
				.map(function(a){
					if(a.pre){
						res = a.pre.call(context, outer, args)

						// if a handler returns a function register is as a post
						// handler...
						if(res 
								&& res !== context 
								&& res instanceof Function){
							a.post = res
						}
					}
					return a })

			// handlers: pre phase...
			handlers
				// NOTE: current action will get included and called by the code 
				// 		above and below, so no need to explicitly call func...
				// NOTE: pre handlers are called FIFO, i.e. the last defined first... 
				.map(function(a){
					if(a.pre){
						res = a.pre.apply(context, args)

						// if a handler returns a function register is as a post
						// handler...
						if(res 
								&& res !== context 
								&& res instanceof Function){
							a.post = res

							// reset the result...
							// NOTE: this is the only difference between this 
							// 		and wrapper stages...
							res = context
						}
					}
					return a })

		// XXX EXPERIMENTAL (after calls)...
		} catch(error){
			// XXX should we unwind this???
			delete context.__action_after_running
			throw error
		}

		// return context if nothing specific is returned...
		res = res === undefined ? context 
			: res instanceof ASIS ? res.value
			// XXX returning an explicit [undefined]...
			//: res instanceof Array
			//		&& res.length == 1
			//		&& res.indexOf(undefined) == 0 ?
			//	undefined
			: res

		return {
			arguments: args,

			wrapper: call_wrapper,
			handlers: handlers,

			result: res,
		}
	},
	post: function(context, data){
		var res = data.result

		var args = data.arguments || []
		// the post handlers get the result as the first argument...
		args.splice(0, 0, res)

		var outer = this.name

		try {
			// handlers: post phase...
			data.handlers && data.handlers
				// NOTE: post handlers are called LIFO -- last defined last...
				.reverse()
				.forEach(function(a){
					a.post
						&& a.post.apply(context, args)
				})

			// wrapper handlers: post phase...
			data.wrapper && data.wrapper
				// NOTE: post handlers are called LIFO -- last defined last...
				.reverse()
				.forEach(function(a){
					a.post
						&& a.post.call(context, res, outer, args.slice(1))
				})

		// XXX EXPERIMENTAL (after calls)...
		} catch(error){
			// should we unwind this???
			delete context.__action_after_running
			throw error
		}

		// handle after calls...
		// XXX EXPERIMENTAL (after calls)...
		;(context.__action_after_running || [])
			.slice(2)
			.forEach(function(func){
				func.call(context) })
		// top calls...
		if(context.__action_after_running){
			if(context.__action_after_running[0] == null){
				;(context.__action_after_running[1] || [])
					.forEach(function(func){
						func.call(context) })
				delete context.__action_after_running
			// back to prev level...
			} else {
				context.__action_after_running = context.__action_after_running[0]
			}
		}

		return res
	},


	// chaining...
	// 
	// For docs see: MetaActions.chainApply(..) and the base module doc.
	chainApply: function(context, inner, args){
		args = [...(args || [])]
		var outer = this.name

		var data = this.pre(context, args)

		// call the inner action/function if preset....
		// NOTE: this is slightly different (see docs) to what happens in 
		// 		.pre(..)/.post(..), thus we are doing this separately and 
		// 		not reusing existing code...
		if(inner){
			var res = inner instanceof Function ? 
					inner.apply(context, args)
				: inner instanceof Array && inner.length > 0 ? 
					context[inner.pop()].chainApply(context, inner, args)
				: typeof(inner) == typeof('str') ?
					context[inner].chainApply(context, null, args)
				: undefined

			// call the resulting function...
			if(res instanceof Function){
				res.apply(context, [context].concat(args))
				data.result = context

			// push the inner result into the chain...
			} else if(res !== undefined){
				data.result = res
			}
		}

		// returned promise -> await for resolve/error...
		// XXX should we be able to set this in the context???
		if(data.result instanceof Promise
				&& (context.getRootActionAttr || MetaActions.getRootActionAttr)
					.call(context, this.name, 'await') ){
			var that = this
			return data.result
				.then(function(){
					return that.post(context, data) })
				.catch(function(){
					return that.post(context, data) })
		}

		return this.post(context, data)
	},
	chainCall: function(context, inner){
		return this.chainApply(context, inner, [...arguments].slice(2)) },


	// constructor...
	//
	// 	Action(<name>, <function>)
	// 	Action(<name>[, <doc>[, <long-doc>]][, <attrs>,] <function>)
	// 	Action(<name>, [ [<doc>[, <long-doc>]][, <attrs>,] <function> ])
	// 		-> <action>
	//
	__new__: function(context, name, doc, ldoc, attrs, func){
		// prevent action overloading...
		// XXX do we need this???
		//if(context != null && context[name] != null){
		//	throw 'action "'+name+'" already exists.' }

		// create the actual instance we will be returning...
		var meth = function(){
			return meth.chainApply(this, null, arguments) }
		meth.__proto__ = this.__proto__

		// precess args...
		var args = doc instanceof Array ? 
			doc 
			: [...arguments]
				.slice(2)
				.filter(function(e){ return e !== undefined })
		func = args.pop()
		last = args[args.length-1]
		attrs = (last != null && typeof(last) != typeof('str')) ? 
			args.pop() 
			: {}
		doc = typeof(args[0]) == typeof('str') ? 
				args.shift() 
			: func.doc ? 
				func.doc
			: null
		ldoc = typeof(args[0]) == typeof('str') ? 
				args.shift() 
			: func.long_doc ? 
				func.long_doc
			: null

		// populate the action attributes...
		//meth.name = name
		Object.defineProperty(meth, 'name', {
			value: name,
		})
		func.doc = meth.doc = doc
		func.long_doc = meth.long_doc = ldoc

		meth.func = func

		if(func.name == '<action-name>'){
			Object.defineProperty(func, 'name', {
				value: name,
			})
		}

		// make introspection be a bit better...
		meth.toString = function(){
			return object.normalizeIndent(func.toString()) }

		// setup attrs...
		Object.assign(meth, attrs)
		Object.assign(func, attrs)

		return meth
	},
})



//---------------------------------------------------------------------

// Action alias constructor...
// 
// This is signature compatible with Action(..) with one difference being 
// that this expects the target to be a string compatible with 
// .parseStringAction(..)...
// 
// This will resolve special alias args:
// 		name	-> parseStringAction.Identifier(name)	-> this[name]
// 		$N		-> parseStringAction.Argument(N)		-> arguments[n]
// 		...		-> parseStringAction.ALLARGS			-> arguments
// 	
// 
// XXX alias parsing is dependant on the action set, move this functionality
// 		to the ActionSet.alias(..) method/action...
// XXX handle alias args and pass them to the target...
// XXX should an alias return a value???
var Alias =
module.Alias =
object.Constructor('Alias', {
	__proto__: Action.prototype,

	__new__: function(context, alias, doc, ldoc, attrs, target){
		// precess args...
		var args = doc instanceof Array ? 
			doc 
			: [...arguments]
				.slice(2)
				.filter(function(e){ return e !== undefined })
		target = args.pop()
		last = args[args.length-1]
		attrs = (last != null && typeof(last) != typeof('str')) ? 
			args.pop() 
			: {}
		doc = typeof(args[0]) == typeof('str') ? 
			args.shift() 
			: null
		ldoc = typeof(args[0]) == typeof('str') ? 
			args.shift() 
			: null

		attrs.alias = target

		// NOTE: we are not parsing this directly here because the context
		// 		may define a different .parseStringAction(..)
		var parsed = typeof(target) == typeof('str') ? 
			null 
			: target

		doc = (!doc && parsed) ? 
			parsed.doc 
			: doc

		var func = function(){
			// empty alias...
			if(target == ''){
				return }

			var p = parsed 
				|| (this.parseStringAction || parseStringAction)(target)

			return p.action in this ?
				(this.parseStringAction || parseStringAction).callAction(this, p, ...arguments)
				// error...
				: console.error(`${alias}: Unknown alias target action: ${p.action}`) }
		func.toString = function(){ 
			return meth.alias.code || meth.alias }

		// make the action...
		var meth = object.parentCall(Alias.prototype.__new__, this, context, alias, doc, ldoc, attrs, func)
		//meth.__proto__ = this.__proto__

		meth.func.alias = target

		return meth
	},
})



//---------------------------------------------------------------------

// A base action-set object...
//
// This will define a set of action-set specific methods and helpers.
//
// XXX .off(...) needs more work...
// XXX need a mechanism to publish specific attrs...
var MetaActions =
module.MetaActions = {
	// List actions...
	//
	get actions(){
		var res = []
		for(var k in this){
			// avoid recursion, skip props...
			var cur = this
			var prop = Object.getOwnPropertyDescriptor(cur, k)
			while(!prop && cur.__proto__ != null){
				var cur = cur.__proto__
				var prop = Object.getOwnPropertyDescriptor(cur, k)
			}
			if(prop.get != null){
				continue
			}
			//if(k == 'actions' || k == 'length'){
			//	continue
			//}
			// get only actions...
			if(this[k] instanceof Action){
				res.push(k)
			}
		}
		return res
	},


	// List aliases...
	//
	// NOTE: this will only show the aliases local to this.
	get aliases(){
		var that = this
		return this.actions
			.filter(function(n){ 
				return that.hasOwnProperty(n)
					&& that[n] instanceof Alias }) },

	// XXX move this to the right spot...
	parseStringAction: parseStringAction,
	isStringAction: isStringAction,

	// XXX EXPERIMENTAL...
	call: function(action, ...args){
		return action instanceof Function ?
				action.apply(this, args)
			: this[action] ?
				this[action].apply(this, args)
			: this.parseStringAction.applyAction(this, action, args) },
	apply: function(action, args){
		return this.call(action, ...args)},


	// Set/remove action alias...
	//
	// 	Set alias...
	// 	.alias(alias, code)
	// 	.alias(alias[, doc[, long-doc]][, attrs,] code)
	// 	.alias(alias, [ [doc[, long-doc]][, attrs,] code ])
	// 		-> action-set
	//
	// 	Remove alias...
	// 	.alias(alias, null)
	// 	.alias(alias, false)
	// 		-> action-set
	//
	// code should be compatible with .parseStringAction(..)
	//
	// NOTE: this does not check if it will override anything, so it is
	// 		possible to override/delete an action/method/attribute with 
	// 		this...
	//
	// XXX should this prevent overriding stuff???
	// XXX move to a better spot...
	alias: Action('alias', function(alias, target){
		// remove alias...
		if(arguments.length == 2
				&& (target === false || target === null)){
			// delete only aliases...
			this[alias] instanceof Alias
				&& (delete this[alias])

		// set alias...
		} else {
			//var parsed = typeof(target) == typeof('str') ?
			//	this.parseStringAction(target)
			//	: target
			this[alias] = Alias.apply(null, arguments)
		}
	}),


	// Get action attribute...
	//
	// Attribute search order (return first matching):
	// 	- Local action
	// 	- Local action function (.func)
	// 	- if an alias look in the target...
	// 	- repeat for .__proto__ (until top of MRO)
	// 	- repeat for '__actioncall__' special action (XXX EXPERIMENTAL)
	//
	//
	// NOTE: this will get attribute set both on the action object and 
	// 		the action function, this covers two usecases:
	// 		1) action constructor attributes...
	// 			someAction: ['...',
	// 				// action attribute...
	// 				{attr: 'value'},
	// 				function(){ ... }],
	// 		2) action modifiers... 
	// 			var modifyAction = function(func){
	// 				// function attribute...
	// 				func.attr = 'value'
	// 				return func
	// 			}
	//			...
	// 			someAction: ['...',
	// 				modifyAction(function(){ ... })],
	//
	// XXX document...
	// XXX add option to to enable/disable look in .__actioncall__... 
	getActionAttr: function(action, attr){
		var cur = this

		// go up the proto chain...
		while(cur.__proto__ != null){
			var c = cur[action]
			if(c != null){
				// attribute of action...
				if(c[attr] !== undefined){
					return c[attr]

				// attribute of action function...
				} else if(c.func && c.func[attr] !== undefined){
					return c.func[attr]

				// alias -> look in the target action...
				} else if(c instanceof Alias){
					var res = this.getActionAttr(
						this.parseStringAction(cur[action].alias).action, 
						attr)
					if(res !== undefined){
						return res
					}
				}
			}
			cur = cur.__proto__
		}

		// search .__actioncall__ action...
		if(cur[action] != null && action != '__actioncall__'){
			return this.getActionAttr('__actioncall__', attr)
		}
	},

	// Get root action attribute value...
	//
	// This is similar to .getActionAttr(..) but will only chenck the 
	// root action for the attribute...
	//
	// NOTE: if an attr is not explicitly defined in the root action, the
	// 		base Action object is checked (Action.prototype.await)...
	getRootActionAttr: function(action, attr){
		var cur = this

		// go up the proto chain...
		while(cur.__proto__ != null){
			if(cur[action] != null){
				var target = cur
			}
			cur = cur.__proto__
		}

		// attribute of action...
		if(target[action][attr] !== undefined){
			return target[action][attr]

		// attribute of action function...
		} else if(target[action].func 
				&& target[action].func[attr] !== undefined){
			return target[action].func[attr]
		}
	},

	// Get action documentation...
	//
	// Format:
	// 	{
	// 		action-name: [
	// 			doc,
	// 			long_doc,
	// 			name,
	// 		],
	// 		...
	// 	}
	//
	// NOTE: oveloading actions will shadow parents doc if they define .doc.
	getDoc: function(actions){
		var res = {}
		var that = this
		actions = actions == null ? this.actions
			: arguments.length > 1 ? [...arguments]
			: typeof(actions) == typeof('str') ? [actions]
			: actions

		// get the first defined set of docs in the inheritance chain...
		actions.forEach(function(n){
			var cur = that
			res[n] = []
			// go up the proto chain...
			while(cur.__proto__ != null){
				if(cur[n] != null && cur[n].doc != null){
					res[n] = [ cur[n].doc, cur[n].long_doc, cur[n].name ]
					break
				}
				cur = cur.__proto__
			}
		})
		return res
	},

	getPath: function(actions){
		var res = {}
		var that = this
		actions = actions == null ? this.actions
			: arguments.length > 1 ? [...arguments]
			: typeof(actions) == typeof('str') ? [actions]
			: actions

		// get the first defined set of docs in the inheritance chain...
		actions.forEach(function(n){
			var cur = that
			// go up the proto chain...
			while(cur.__proto__ != null){
				if(cur[n] != null && cur[n].doc != null){
					var doc = cur[n].doc
					var long_doc = cur[n].long_doc
					break
				}
				cur = cur.__proto__
			}

			res[(doc && doc.replace(/[\\\/]$/, '/'+n)) || n] = [n, doc, long_doc]
		})
		return res
	},


	// Toggle handler cache...
	//
	//	Toggle cache...
	//	.toggleHandlerCache()
	//
	//	Set caching on...
	//	.toggleHandlerCache('on')
	//	.toggleHandlerCache(true)
	//
	//	Set caching off...
	//	.toggleHandlerCache('off')
	//	.toggleHandlerCache(false)
	//
	//	Reset caching...
	//	.toggleHandlerCache('!')
	//
	//	Get current caching state...
	//	.toggleHandlerCache('?')
	//
	//	Get supported states...
	//	.toggleHandlerCache('??')
	//		-> ['on', 'off']
	//
	//
	// NOTE: setting the cache on may prevent calling of actions event
	// 		handlers of parent action-sets if they are added (via .on(..)
	// 		or .one(..), ...) AFTER the current object cloned it's cache.
	// 		to avoid this, care must be taken to reset the cache of 
	// 		children objects, or not use caching for cases where action
	// 		event handlers can be added on the tree in runtime.
	//
	//
	// XXX should we use the toggler object here???
	// XXX EXPERIMENTAL (handler cache)...
	toggleHandlerCache: function(to){
		if(to == '?'){
			return this.__handler_cache ? 'on' : 'off'

		} else if(to == '??'){
			return ['on', 'off']
		}

		to = (to === true || to == 'on') ? true
			: (to === false || to == 'off') ? false
			: to == '!' ? !!this.__handler_cache
			: !this.__handler_cache 

		if(to){
			// no local cache -> copy from parent...
			if(this.__handler_cache 
					&& !Object.hasOwnProperty(this, '__handler_cache')){
				var parent = this.__handler_cache
				var cache = this.__handler_cache = {}
				for(var a in parent){
					cache[a] = parent[a]
				}

			// local cache only...
			} else {
				this.__handler_cache = this.__handler_cache || {}
			}

		} else {
			// NOTE: we do not delete here so as to shadow the parent's 
			// 		cache...
			this.__handler_cache = false
		}

		// XXX this is not the handler protocol...
		return this
	},

	// Rest handler cache...
	// 	
	// 	Reset the full cache...
	// 	.resetHandlerCache()
	// 		-> this
	//
	// 	Reset handler cache for action...
	// 	.resetHandlerCache(action)
	// 		-> this
	//
	// NOTE: when .toggleHandlerCache('?') is 'off' this has no effect.
	//
	// XXX EXPERIMENTAL (handler cache)...
	resetHandlerCache: function(name){
		var cache = this.__handler_cache
		if(cache){
			// full reset...
			if(name == null){
				this.__handler_cache = {}

			// reset action...
			} else {
				// no local cache -> copy from parent...
				if(!Object.hasOwnProperty(this, '__handler_cache')){
					var parent = this.__handler_cache
					var cache = this.__handler_cache = {}
					for(var a in parent){
						cache[a] = parent[a]
					}
				}

				delete cache[name]
			}
		}
		return this
	},

	// Get action handlers from the inheritance chain...
	//
	// NOTE: this collects both the event handlers (in order of hierarchy,
	// 		then order of definition) and actions (in order of hierarchy)
	// NOTE: this is the correct order for 'pre' calling, but is the 
	// 		reverse of how the 'post' handlers must be called.
	// NOTE: if .toggleHandlerCache('?') is on, this will serch once and
	// 		return the cached results on every subsequent call.
	//
	// For more docs on handler sequencing and definition see: .on(..)
	getHandlerList: function(name){
		// handler cache...
		// XXX EXPERIMENTAL (handler cache)...
		var cache = this.__handler_cache
		if(cache && cache[name]){
			return cache[name].slice()
		}

		// get the handlers...
		var handlers = []
		var cur = this
		while(cur.__proto__ != null){
			// get action "event" handlers...
			if(cur.hasOwnProperty('_action_handlers') 
					&& name in cur._action_handlers){
				handlers.splice.apply(handlers,
						[handlers.length, 0].concat(cur._action_handlers[name]))
			}

			// get the overloading action...
			// NOTE: this will get all the handlers including the root 
			// 		and the current handlers...
			// NOTE: if this encounters a matching mormal method/function 
			// 		this will not search beyond it.
			if(cur.hasOwnProperty(name)){
				// action -> collect...
				if(cur[name] instanceof Action){
					handlers.push(cur[name].func)

				// function -> terminate chain...
				} else if(cur[name] instanceof Function){
					handlers.push(cur[name])
					break
				}
			}

			cur = cur.__proto__
		}

		// handler cache... 
		// XXX EXPERIMENTAL (handler cache)...
		if(cache){
			cache[name] = handlers
		}

		return handlers
	},

	// Get structured action handler definitions...
	//
	// Format:
	// 	[
	// 		{
	// 			// NOTE: only one handler per level can be present, either
	// 			//		.pre or .post, this does not mean that one can
	// 			//		not define both, just that they are stored separately
	// 			pre|post: <handler>,
	//
	// 			// XXX
	// 			alias: <target>,
	// 		},
	// 		...
	// 	]
	//
	// XXX need to get parent action or definition context for each level... 
	// XXX is this simpler to use than the original .getHandlerList(..)
	// XXX rename this....
	getHandlers: function(name){
		return (this.getHandlerList || MetaActions.getHandlerList).call(this, name)
			.map(function(a){ 
				var res = {
					// action doc...
					// XXX
				}

				if(!a.post_handler){
					res.pre = a

				} else {
					res.post = a.post_handler
				}

				a.doc
					&& (res.doc = a.doc)
				a.long_doc
					&& (res.long_doc = a.long_doc)

				return res }) },

	// Handler for cases when we need to avoid the pre/post handlers...
	//
	// Returns:
	// 	- undefined		- handle the action normally.
	// 	- object		- bypass action handlers.
	//
	// NOTE: the object result must be compatible with Action.pre(..) 
	// 		return value...
	// NOTE: this is mostly a stub, here for documentation reasons...
	// XXX doc / revise...
	//preActionHandler: doWithRootAction(
	//	function(action, name, handlers, args){ return null }),

	
	// Register an action callback...
	//
	//	Register a post action callback
	// 	.on('action', [<tag>, ]<function>)
	// 	.on('action.post', [<tag>, ]<function>)
	// 		-> <action-set>
	//
	// 	Register a pre action callback
	// 	.on('action.pre', [<tag>, ]<function>)
	// 		-> <action-set>
	//
	// Modes:
	// 	'pre'		- the handler is fired before the action is triggered,
	// 					and if the handler returns a deferred or a function
	// 					then that will get resolved, called resp. after
	// 					the action is done.
	// 	'post'		- the handler is fired after the action is finished.
	// 					this is the default.
	//
	// Handler Arguments:
	// 	'pre'		- the handler will get the same arguments as the main
	// 					action when called.
	// 	'post'		- the handler will get the action return value followed
	// 					by action arguments.
	//
	// The optional tag marks the handler to enable group removal via 
	// .off(..)
	//
	// NOTE: 'post' mode is the default.
	//
	// XXX should we have multiple tags per handler???
	on: function(actions, b, c){
		var handler = typeof(c) == 'function' ? c : b
		var tag = typeof(c) == 'function' ? b : c

		// XXX make this split by whitespace...
		actions = typeof(actions) == 'string' ? actions.split(/ +/) : actions

		var that = this
		actions.forEach(function(action){
			// prepare the handler...
			var mode = action.split('.')
			action = mode[0]
			mode = mode[1]

			that.resetHandlerCache(action)

			// keep the original handler for future use...
			var a_handler = handler

			// a post handler (default)...
			if(mode == null || mode == 'post'){
				var old_handler = a_handler
				a_handler = function(){ return old_handler }
				a_handler.post_handler = old_handler
					// NOTE: this is set so as to identify the handler 
					// 		for removal via. .off(..)
				a_handler.orig_handler = old_handler.orig_handler || old_handler

				a_handler.orig_handler.event_tag = tag

			// not pre mode...
			} else if(mode != 'pre') {
				// XXX
				throw 'Unknown action mode: '+action+'.'+mode
			}

			a_handler.event_tag = tag

			// register handlers locally only...
			if(!that.hasOwnProperty('_action_handlers')){
				that._action_handlers = {}
			}
			if(!(action in that._action_handlers)){
				that._action_handlers[action] = []
			}
			// register a handler only once...
			if(that._action_handlers[action].indexOf(a_handler) < 0){
				// NOTE: last registered is first...
				that._action_handlers[action].splice(0, 0, a_handler)
			}
		})

		return this
	},

	// Remove an action callback...
	//
	//	Remove all handlers from action:
	//	.off('action')
	//	.off('action', '*')
	//	.off('action', 'all')
	// 		-> <action-set>
	//
	//	Remove specific handler from action:
	//	.off('action', <handler>)
	// 		-> <action-set>
	//
	//	Remove handlers from action by tag:
	//	.off('action', <tag>)
	// 		-> <action-set>
	//
	// NOTE: the handler passed to .off(..) for removal must be the same
	// 		as the handler passed to .on(..) / .one(..)
	off: function(actions, handler){
		if(this.hasOwnProperty('_action_handlers')){

			actions = actions == '*' ? Object.keys(this._action_handlers)
				: typeof(actions) == 'string' ?  actions.split(' ')
				: actions

			var that = this
			actions.forEach(function(action){
				var mode = action.split('.')
				action = mode[0]
				mode = mode[1]

				that.resetHandlerCache(action)

				// get the handlers...
				var h = that._action_handlers[action] || []

				// remove explicit handler...
				if(typeof(handler) == 'function'){
					var i = -1
					if(mode == null || mode == 'post'){
						// XXX find via e.orig_handler == handler && e.mode == 'post'
						h.forEach(function(e, j){
							// NOTE: we will only get the first match...
							if(e.orig_handler === handler && i == -1){
								i = j
							}
						})

					} else if(mode == 'pre'){
						i = h.indexOf(handler)
					}

					// NOTE: unknown modes are skipped...
					if(i >= 0){
						h.splice(i, 1)
					}

				// remove all handlers...
				} else if(handler == null || handler == 'all' || handler == '*'){
					h.splice(0, h.length)

				// remove handlers by tag...
				} else {
					// filter out everything that mathches a tag in-place...
					h.splice.apply(h, 
							[0, h.length]
								.concat(h.filter(function(e){ 
									return e.event_tag != handler })))
				}
			})
		}

		return this
	},

	// Register an action callback that will only fire once per event...
	//
	// This is signature compatible with .on(..)
	one: function(actions, b, c){
		var _handler = typeof(c) == 'function' ? c : b
		var tag = typeof(c) == 'function' ? b : c

		actions = typeof(actions) == 'string' ? actions.split(' *') : actions

		var that = this
		actions.forEach(function(action){
			// NOTE: we are using both 'that' below and 'this', so as
			// 		to separate the call context and the bind context,
			//		.off(..) must be called at the bind context while
			//		the actual action is called from the call context
			// NOTE: we are not using the closure _handler below to 
			// 		keep the code introspectable, and direct the user
			// 		to the original function.
			var handler = function(){
				// remove handler...
				that.off(action, handler.orig_handler)

				// call the actual supplied handler function...
				return handler.orig_handler.apply(this, arguments)
			}
			handler.orig_handler = _handler
			that.on(action, tag, handler)
		})

		return this
	},

	// XXX EXPERIMENTAL (after calls)...
	isActionRunning: function(){
		return !!this.__action_after_running },
	// Queue a function after the action is done...
	//
	// 	.afterAction(func)
	// 	.afterAction('top', func)
	// 		-> this
	//
	// 	.afterAction('local', func)
	// 		-> this
	//
	// XXX EXPERIMENTAL (after calls)...
	afterAction: function(mode, func){
		func = mode instanceof Function ? mode : func
		mode = mode instanceof Function ? null : mode
		mode = mode || 'top'

		if(!this.__action_after_running){
			throw new Error('afterAction: no action is running.')
		}

		;(mode == 'top' ?
				this.__action_after_running[1]
			: mode == 'local' ?
				this.__action_after_running
			: this.__action_after_running)
			.push(func) 

		return this
	},

	// Apply/call a function/action "inside" an action...
	//
	// 	.chainApply(outer, inner)
	// 	.chainApply(outer, inner, arguments)
	// 		-> result
	//
	// 	.chainCall(outer, inner)
	// 	.chainCall(outer, inner, ..)
	// 		-> result
	//
	//
	// The inner action call is completely nested as base of the outer 
	// action.
	//
	//		Outer action		o-------x		o-------x
	//									v		^
	//		Inner action				o---|---x
	//
	// The given arguments are passed as-is to both the outer and inner
	// actions.
	// The inner action return value is passed to the outer action
	// .post handlers.
	//
	// inner return value is handling slightly differs from the base
	// action protocol in two respects:
	// 	1) to keep the outer return value, inner must return undefined.
	// 	2) to guarantee returning the context regardless of outer's return 
	// 		value, the inner must return the context (this) explicilty.
	//
	// NOTE: as a restriction of the action protocol the inner return will
	// 		override the return value of outer, but there is no way to 
	// 		see that value.
	// NOTE: these call the action's .chainApply(..) and .chainCall(..)
	// 		methods, thus is not compatible with non-action methods...
	// NOTE: .chainCall('action', ..) is equivalent to .action.chainCall(..)
	chainApply: function(outer, inner, args){
		return this[outer].chainApply(this, inner, args) },
	chainCall: function(outer, inner){
		return this[outer].chainApply(this, inner, [...arguments].slice(2)) },


	// Call action handlers serted by .sortedActionPriority...
	//
	// NOTE: this by design ignores the action call results to avoid 
	//		actions competing on who will return a value...
	// NOTE: if action name does not exist this will do nothing and 
	//		return normally (without error)...
	// NOTE: this essentially re-implements parts of the .pre(..)/.post(..)
	// 		action protocol...
	// NOTE: this may not support some legacy action protocol features...
	callSortedAction: function(name, ...args){
		var that = this
		this.getHandlers(name)
			.map(function(h, i){ 
				var p = (h.pre || {}).sortedActionPriority
				// normalize priority...
				p = p == 'high' ?
						50
					: p == 'normal' ?
						0
					: p == 'low' ?
						-50
					: p
				return [i, p, h] })
			// sort by .sortedActionPriority ascending...
			.sort(function([ia, pa, a], [ib, pb, b]){
				return (pa != null && pb != null) ?
						pa - pb
					: (pa > 0 || pb < 0) ?
						1
					: (pb > 0 || pa < 0) ?
						-1
					: ia - ib })
			// the list should be ordered descending form highest 
			// priority or closeness to root action...
			.reverse()
			// call the actions (pre)...
			.map(function([i, p, a]){
				return a.pre ? 
					a.pre.call(that, ...args)
					: a.post })
			.reverse()
			// call the actions (post)...
			// NOTE: we do not care about call results here...
			.forEach(function(func){
				func instanceof Function
					&& func.call(that, ...args) }) 
		return this },
		


	// Get action/method resolution order...
	//
	// 	List mixin tags...
	// 	.mro()
	// 	.mro('tag')
	// 		-> tags
	//
	// 	List mixin objects...
	// 	.mro('object')
	// 		-> objects
	//
	// 	List mixin tag-object pairs...
	// 	.mro('item')
	// 		-> items
	//
	// NOTE: this will return the full MRO including Object.prototype
	mro: function(target){
		target = target || 'tag'
		var res = []
		var cur = this
		while(cur != null){
			res.push(target == 'tag' ? cur.__mixin_tag
				: target == 'object' ? cur
				: [cur.__mixin_tag, cur])
			// go to next item in chain...
			cur = cur.__proto__
		}
		return res
	},
	
	// Get mixin object in inheritance chain...
	//
	// NOTE: from can be either an explicit action object or a tag...
	// NOTE: if pre is true this will return the chain item before the 
	// 		mixin, this is useful, for example, to remove mixins, see 
	// 		.mixout(..) for an example...
	getMixin: function(from, pre){
		var mro = this.mro('object')
		var res = (pre ? mro.slice(1) : mro)
			.filter(function(e){ 
				return e.__mixin_tag == from 
					|| e.__mixin_source === from })
			.shift()
		return pre ?
			mro[mro.indexOf(res)-1]
			: res
	},

	// Mixin a set of actions into this...
	//
	// NOTE: if 'all' is set then mixin all the actions available, 
	// 		otherwise only mixin local actions...
	// NOTE: this will override existing own attributes.
	//
	// XXX should we include functions by default????
	// XXX should .source_tag be set here or in Actions(..)???
	inlineMixin: function(from, options){
		// defaults...
		options = options || {}
		var descriptors = options.descriptors || true
		var all_attr_types = options.all_attr_types || false
		var source_tag = options.source_tag

		resetHandlerCache = (this.resetHandlerCache || MetaActions.resetHandlerCache)
		resetHandlerCache.call(this)

		if(options.all){
			var keys = []
			for(var k in from){
				keys.push(k)
			}
		} else {
			var keys = Object.keys(from)
		}

		var that = this
		keys.forEach(function(k){
			/*
			// XXX is this the right way to go???
			// check if we are not overwriting anything...
			if(that.hasOwnProperty(k)){
				console.warn('WARNING:', that,'already has attribute', k, '- skipping...')
				return
			}
			*/

			// properties....
			var prop = Object.getOwnPropertyDescriptor(from, k)
			if(descriptors && prop.get != null){
				// NOTE: so as to be able to delete this on mixout...
				prop.configurable = true
				Object.defineProperty(that, k, prop)

			// actions and other attributes...
			} else {
				var attr = from[k]
				if(all_attr_types 
						|| attr instanceof Function
						|| attr instanceof Action){
					that[k] = attr
				}

				// source tag actions...
				// XXX should this set action and method .source_tag or only action???
				//if(source_tag && attr instanceof Action){
				if(source_tag && (attr instanceof Action || attr instanceof Function)){
					// existing tag...
					if(that[k].source_tag == source_tag 
							|| (that[k].func || {}).source_tag == source_tag){
						return

					// new tag...
					// XXX not sure if this is the right way to go...
					} else if(that[k].source_tag 
							|| (that[k].func || {}).source_tag){
						console.warn('Aactions: about to overwrite source tag...\n'
							+'  from: "'
								+(that[k].source_tag 
									|| (that[k].func || {}).source_tag)+'"\n'
							+'  to: "'+source_tag+'"\n'
							+'  on:', that[k])
					}

					if(that[k].func){
						that[k].func.source_tag = source_tag
					}
					that[k].source_tag = source_tag
				}
			}
		})

		return this
	},

	// Same as .inlineMixin(..) but isolates a mixin in a seporate object
	// in the inheritance chain...
	//
	mixin: function(from, options){
		options = options || {}
		options.source_tag = options.source_tag || from.__mixin_tag

		var proto = Object.create(this.__proto__)

		// mixinto an empty object
		proto.inlineMixin(from, options)

		// mark the mixin for simpler removal...
		proto.__mixin_source = from

		// add source tag to proto...
		if(options && options.source_tag){
			proto.__mixin_tag = options.source_tag
		}

		this.__proto__ = proto

		return this
	},

	// Mixin from after target in the mro...
	//
	// NOTE: target must be .getMixin(..) compatible...
	mixinAfter: function(target, from, options){
		this
			.getMixin(target)
			.mixin(from, options)
		return this
	},

	// Mixin a set of local actions into an object...
	//
	// XXX this will not work on non-actions...
	mixinTo: function(to, options){
		return this.mixin.call(to, this, options) },

	// Remove mixed in actions from this...
	//
	// NOTE: this will only remove local actions, inherited actions will
	// 		not be affected...
	// NOTE: this will not affect event handlers, they should be removed
	// 		manually if needed...
	inlineMixout: function(from, options){
		// defaults...
		options = options || {}
		var descriptors = options.descriptors || true
		var all_attr_types = options.all_attr_types || false

		(this.resetHandlerCache || MetaActions.resetHandlerCache).call(this)

		if(options.all){
			var keys = []
			for(var k in from){
				keys.push(k)
			}
		} else {
			var keys = Object.keys(from)
		}

		var locals = Object.keys(this)
		var that = this
		keys.forEach(function(k){
			var prop = Object.getOwnPropertyDescriptor(from, k)

			// descriptor...
			if(descriptors && prop.get != null){
				if(prop.get === Object.getOwnPropertyDescriptor(that, k).get){
					delete that[k]
				}

			// actions and other attrs...
			} else {
				var attr = from[k]
				if((all_attr_types || attr instanceof Action) 
						// remove only local attrs...
						&& locals.indexOf(k) >= 0){
					delete that[k]
				}
			}
		})

		return this
	},

	// This is similar in effect but different in mechanics to .inlineMixout(..)
	//
	// This will find and remove a mixin object from the inheritance chain.
	//
	// NOTE: this will remove only the first occurance of a mixin.
	mixout: function(from){
		var o = this.getMixin(from, true)
		var target = null

		// pop the mixin off the chain...
		if(o != null){
			target = o.__proto__
			o.__proto__ = o.__proto__.__proto__
			this.resetHandlerCache()
		}

		return target
	},

	// Remove a set of local mixed in actions from object...
	//
	mixoutFrom: function(to, options){
		return this.mixout.call(to, this, options) },

	// Create a child object...
	//
	// NOTE: this will create a .config in the instance that inherits from
	// 		this.config...
	// NOTE: this will not copy/clone any data.
	//
	// XXX is this correct???
	// XXX should this be an action???
	clone: function(full){
		var o = Object.create(this)
		if(this.config){
			if(full){
				o.config = JSON.parse(JSON.stringify(this.config))
			} else {
				o.config = Object.create(this.config)
			}
		}
		return o
	},

	getHandlerSourceTags: function(name){
		return this.getHandlers(name)
			.map(function(a){
				return a.pre ? (a.pre.source_tag || a.pre.event_tag)
					: a.post ? (a.post.source_tag || a.post.event_tag)
					: null
			})
			.unique() },


	// Run a function in the context of the action set...
	//
	// This will return 'this' if func returns undefined, otherwise func
	// return value is returned.
	//
	// This is here simply as a utility function, to enable running code 
	// in a concatinative manner without interruption...
	run: function(func){
		var res = func ? func.call(this) : undefined
		return res === undefined ? this : res
	},


	// doc generators...
	//
	// XXX would be nice to make these prop of the action itself but I 
	// 		do not see a way to do this properly yet -- we can't get to 
	// 		the action context from the action dynamically...
	// XXX add doc per action...
	getHandlerDocStr: function(name){
		var lst = this.getHandlers(name)
		var str = ''

		var getTags = function(handler, p){
			return (handler.event_tag ? 
					object.normalizeIndent('// Event tag: ' + handler.event_tag) + p 
					: '')
				+ (handler.source_tag ? 
					object.normalizeIndent('// Source tag: ' + handler.source_tag) + p 
					: '') }
		var getDoc = function(cur, p){
			return (cur.doc ? 
					'// --- .doc ---'+p
					+'// '+ object.normalizeIndent(cur.doc).replace(/\n/g, p+'// ') +p 
					: '')
				+ (cur.long_doc ? 
					'// --- .long_doc ---'+p
					+'// '+ object.normalizeIndent(cur.long_doc).replace(/\n/g, p+'// ') + p 
					: '') }

		var handler = function(p){
			if(lst.length == 0){
				//str += p + '---'
				return
			}

			// indicate root action...
			p = lst.length == 1 ? p+'| ' : p+' '

			var cur = lst.shift()

			if(cur.pre){
				str += p 
					+ getTags(cur.pre, p)
					+ getDoc(cur, p)
					// code...
					+ object.normalizeIndent(cur.pre.toString()).replace(/\n/g, p)
					+ p
			}

			handler(p + '  |')

			str += p

			if(cur.post){
				str += p + p 
					+ getTags(cur.post, p)
					+ getDoc(cur, p)
					// code...
					+ object.normalizeIndent(cur.post.toString()).replace(/\n/g, p)
			}
		}

		handler('\n|')

		return str
	},
	getHandlerDocHTML: function(name){
		var lst = this.getHandlers(name)
		var res = $('<div class="action">')

		var handler = function(p){
			if(lst.length == 0){
				return
			}

			var cur = lst.shift()
			p = $('<div class="level">')
				.appendTo(p)

			if(cur.pre){
				p.append($('<pre>').html(
					// meta...
					(cur.pre.event_tag ? 
						object.normalizeIndent('// Event tag: ' + cur.pre.event_tag) + p : '')
					+ (cur.pre.source_tag ? 
						object.normalizeIndent('// Source tag: ' + cur.pre.source_tag) + p : '')
					// code...
					+ object.normalizeIndent(cur.pre.toString())
						.replace(/return/g, '<b>return</b>')))
			}

			handler(p)

			if(cur.post){
				p.append($('<pre>').html(
					// meta...
					(cur.post.event_tag ? 
						object.normalizeIndent('// Event source tag: ' + cur.post.event_tag) + p : '')
					+ (cur.post.source_tag ? 
						object.normalizeIndent('// Source tag: ' + cur.post.source_tag) + p : '')
					// code...
					+ object.normalizeIndent(cur.post.toString())))
			}
		}

		handler(res)

		return res
	},


	// This will create a .config in instances...
	// NOTE: this makes Actions compatible with lib/object.js...
	__init__: function(){
		if(this.__proto__.config && !Object.hasOwnProperty(this, 'config')){
			this.config = Object.create(this.__proto__.config)
		}
	},
}


var ActionSet =
module.ActionSet =
object.Constructor('ActionSet', MetaActions)



// An action set constructor...
//
//	Actions(<object>)
//	Actions(<prototype>, <object>)
//		-> actions
//
// This will pre-process an object to setup the action mechanics.
//
// If the 'this' and prototype both contain a .config attribute then this
// will make set <actions>.config.__proto__ = <prototype>.config 
//
//
// The action format:
// 	{
// 		// full format...
// 		<name> : [
// 			<doc>,
// 			<long-doc>,
// 			<attrs>,
// 			<function> | <alias-code>
// 		],
//
// 		// short doc only...
// 		<name> : [
// 			<doc>,
// 			<function> | <alias-code>
// 		],
//
// 		// only the code...
// 		<name> : [
// 			<function> | <alias-code>
// 		],
// 		...
// 	}
//
//
// NOTE: the action function is always last.
// NOTE: <attrs> if given must be right before the function and must not
// 		be a string...
// NOTE: if <prototype> is not given, MetaActions will be used as default.
//
// For more documentation see: Action(..).
//
// XXX add doc, ldoc, tags and save them to each action...
// XXX is .config processing correct here???
// XXX do we need to handle methods in a special way???
// XXX should this set the .source_tag???
var Actions =
module.Actions =
function Actions(a, b){
	var obj = b == null ? a : b
	var proto = b == null ? b : a
	obj = obj || new ActionSet()

	if(proto != null){
		obj.__proto__ = proto

		// XXX is this the right way to go???
		if(obj.config != null && proto.config != null){
			obj.config.__proto__ = proto.config
		}
	}

	// NOTE: this is intentionally done only for own attributes...
	Object.keys(obj).forEach(function(k){
		// NOTE: we are not getting the attrs directly (vars = obj[k])
		// 		as that will trigger the getters on an object that is
		// 		not in a consistent state...
		// NOTE: this will skip all the getters and setters, they will 
		// 		be included as-is...
		var arg = Object.getOwnPropertyDescriptor(obj, k).value

		// action/alias...
		if(arg instanceof Array 
				&& (arg[arg.length-1] instanceof Function
					|| (typeof(arg[arg.length-1]) == typeof('str')
						&& (arg[arg.length-1] == ''
							// XXX should this be stricter???
							|| (obj.isStringAction || isStringAction)(arg[arg.length-1])))) ){
			obj[k] = arg[arg.length-1] instanceof Function ?
				(new Action(k, arg))
				: (new Alias(k, arg))
		}
	})

	return obj
}




/*********************************************************************/

// NOTE: this can only mix actions sets and MetaActions, i.e. only the 
// 		actions, properties and .config will get handled...
// NOTE: MetaActions is a special case, if given it will be used as the
// 		prototype for the root object in the created chain...
// 		...MetaActions order in the list has no effect.
//
// XXX what the mix order should be?
// 		base, extending, surface		- order of application (current)
// 		surface, extending, base		- python-like
var mix =
module.mix = 
function(){
	var args = [...arguments]
	var res = {}

	// special case: if MetaActions is in the args then inherit the root
	// 		object from it...
	if(args.indexOf(MetaActions) >= 0){
		args.splice(args.indexOf(MetaActions), 1)
		res.__proto__ = MetaActions
	}

	var mixin = MetaActions.inlineMixin

	args.forEach(function(p){
		res = Object.create(mixin.call(res, p))

		// merge config...
		if(p.config){
			var config = res.config = res.config || Object.create({})

			Object.keys(p.config).forEach(function(k){
				res.config.__proto__[k] = JSON.parse(JSON.stringify(p.config[k]))
			})
		}
	})

	return res
}




/*********************************************************************/

var test =
module.test =
function test(){
	// NOTE: this is needed only to add action methods to TestActions...
	var BaseActions = new ActionSet()

	var TestActions = 
	module.TestActions = 
	Actions(BaseActions, {
		testActionGen1: ['baisc test action...',
			'some extra info',
			function(){
				console.log('  test 1!')
				return function(){
					console.log('  test 2!')
				}
			}],

		testActionGen2: ['baisc 2\'nd gen test action...',
			// no extra info...
			function(){
				console.log('  test gen 2!')
				this.testActionGen1()
			}],
	})

	var TestActions2 = 
	module.TestActions2 = 
	Actions(TestActions, {
		// NOTE: this looks like an action and feels like an action but 
		// 		actually this is a callback as an action with this name 
		// 		already exists...
		testActionGen1: [
			function(){
				console.log('  pre callback!')
				return function(){
					console.log('  post callback!')
				}
			}],

		testAction2: ['this is an action',
			function(){
				console.log('testAction2 args:', arguments)
			}],

	})

	// XXX the main question here is that there is no way to know if a 
	// 		particular action is going to be a root action or an action
	// 		callback because we do not know if the action in the parent 
	// 		will be available at mix time or not, and the two models 
	// 		are different...
	// 		XXX one way to do this is to make all code a callback and 
	// 			just use the root as an event trigger...
	//
	// 			...but this effectively means we are implementing 
	// 			inheritance ourselves as the traditional name resolution
	// 			will no longer be used, and as in the case we implement
	// 			MRO why not go the whole way and implement multiple 
	// 			inheritance in the first place...
	//
	// 			...let's try and avoid this...
	/*
	var TestActionMixin =
	module.TestActionMixin = 
	ActionMixin({
		// XXX
	})
	*/


	console.log('TestActions.testActionGen1()')
	TestActions.testActionGen1()
	console.log('TestActions.testActionGen2()')
	TestActions.testActionGen2()

		
	// both of these should cet a callback...
	console.log('TestActions2.testActionGen1()')
	TestActions2.testActionGen1()
	console.log('TestActions2.testActionGen2()')
	TestActions2.testActionGen2()

	// and an event-like handler...
	TestActions2.on('testActionGen1.post', 
			function(){ console.log('  post handler! (first defined)') })
	TestActions2.on('testActionGen1', 
			function(){ console.log('  post handler! (last defined)') })

	console.log('TestActions2.testActionGen1()')
	TestActions2.testActionGen1()

	TestActions2.on('testActionGen2.pre', 
			function(){ console.log('  pre handler! (first defined)') })
	TestActions2.on('testActionGen2.pre', 
			function(){ console.log('  pre handler! (last defined)') })

	console.log('TestActions2.testActionGen2()')
	TestActions2.testActionGen2()
}



/**********************************************************************
* vim:set ts=4 sw=4 :                                                */
return module })
