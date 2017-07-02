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

var args2array = function(a){ return [].slice.call(a) } 

var UNDEFINED =
module.UNDEFINED = ['undefined placeholder']



/*********************************************************************/
// Actions
//
// Actions are an extension to the JavaScript object model tailored for
// a set of specific tasks.
//
// Goals:
// 	- provide a unified mechanism to define and manage user API's for 
// 	  use in UI-hooks, keyboard mappings, scripting, ... etc.
// 	- a means to generate configuration UI's
// 	- a means to generate documentation
//
//
// The main entities:
//
// 	Action set
// 		- an object containing a number of actions,
// 		- optionally, directly or indirectly inherited from MetaActions
// 		  and/or other action sets,
// 		- the action handlers are bound relative to it (._action_handlers)
//
// 	Action
//
//								+  pre	+  pre	+		+  post	+  post	+
//		Action event handler:	o-------x						o-------x
//										v						^
//		Actions							o-------x		o-------x
//												v		^
//		Root Action								o---|---x
//
// 		- a method, created by Action(..),
// 		- calls all the shadowed/overloaded actions in the inheritance 
// 		  chain in sequence implicitly,
// 		  NOTE: there is no way to prevent an action in the chain from
// 		  		running, this is by design, i.e. no way to fully shadow.
// 		- actions that do not shadow anything are called root actions.
// 		- returns the action set by default (for call chaining),
// 		- the base/root action can return any value.
// 		  NOTE: if undefined is returned, it will be replaced by the 
// 		  		action context/action set.
// 		  NOTE: there is no distinction between root and other actions
// 		  		other than that root action's return values are not 
// 		  		ignored.
// 		- can consist of two parts: the first is called before the 
// 		  shadowed action (pre-callback) and the second after (post-callback).
// 		- post-callback has access to the return value and can modify it
// 		  but not replace it.
// 		- can be bound to, a-la an event, calling the handlers when it is 
// 		  called, 
//
// 	Action (event) handler
//  	- a function,
// 		- can be bound to run before and/or after the action itself,
// 		- is local to an action set it was bound via,
// 		- when an action is triggered from an action set, all the pre 
// 		  handlers in its inheritance chain will be called before the 
// 		  respective actions they are bound to and all the post handlers
// 		  are called directly after.
// 		- pre handlers are passed the same arguments the original actions
// 		  got when it was called.
// 		- post action handlers will get the root action result as first 
// 		  argument succeeded by the action arguments.
//
//
//
// The action system main protocols:
//
// 1) Documentation generation and introspection (MetaActions)
//
// 		<action>.toString()
// 				-> code of original action function
// 	
// 		<action-set>.getDoc()
// 		<action-set>.getDoc(<action-name>[, ..])
// 				-> dict of action-name, doc
//
// 		<action-set>.a.getHandlerDocStr(<action-name>)
// 				-> formated string of action handlers
//
// 		<action-set>.actions
// 				-> list of action names
//
// 		<action-set>.length
// 				-> number of actions
//
//
// 2) Event-like callbacks for actions (MetaActions, Action)
//
// 		<action-set>.on('action', function(){ ... })
// 		<action-set>.on('action.post', function(){ ... })
//
// 		<action-set>.on('action.pre', function(){ ... })
//
//
// 3) A mechanism to define and extend already defined actions
// 	This replaces / complements the standard JavaScript overloading 
// 	mechanisms (Action, Actions)
//
// 		// Actions...
// 		var X = Actions({
// 			m: [function(){ console.log('m') }]
// 		})
// 		var O = Actions(X, {
// 			m: [function(){
// 				console.log('pre')
// 				return function(res){
// 					console.log('post')
// 				}
// 			}]
// 		})
//
//	NOTE: what is done here is similar to calling O.__proto__.m.call(..)
//		but is implicit, and not dependant on the original containing 
//		object name/reference ('O'), thus enabling an action to be 
//		referenced and called from any object and still chain correctly.
//
//
//
// Secondary action protocols:
//
// 1) A mechanism to manually call the pre/post stages of an action
// 
// 		Pre phase...
// 		 <action>.pre(<context>)
// 		 <action>.pre(<context>, [<arg>, ..])
// 			-> <call-data>
//
// 		Post phase...
// 		 <action>.post(<context>, <call-data>)
// 			-> <result>
//
// 	This is internally used to implement the action call as well as the
// 	chaining callbacks (see below).
//
// 	All action protocol details apply.
//
// 	NOTE: there is not reliable way to call the post phase without first
// 		calling the pre phase due to how the pre phase is defined (i.e.
// 		pre phase functions can return post phase functions).
//
//
// 2) A mechanism to chain/wrap actions or an action and a function.
// 	This enables us to call a callback or another action (inner) between 
// 	the root action's (outer) pre and post stages.
//
//		Outer action				o-------x		o-------x
//											v		^
//		Inner action/callback				o---|---x
//
//	A trivial example:
//
//		actionSet.someAction.chainApply(actionsSet, 
//			function(){
//				// this gets run between someAction's pre and post 
//				// stages...
//			}, 
//			args)
//
//	This is intended to implement protocols where a single action is
//	intended to act as a hook point (outer) and multiple different 
//	implementations (inner) within a single action set can be used as
//	entry points.
//
//		// Protocol root action (outer) definition...
//		protocolAction: [function(){}],
//
//		// Implementation actions (inner)...
//		implementationAction1: [function(){
//			return this.protocolAction.chainApply(this, function(){
//				// ...
//			}, ..)
//		}]
//
//		implementationAction2: [function(){
//			return this.protocolAction.chainApply(this, function(){
//				// ...
//			}, ..)
//		}]
//
//	Now calling any of the 'implementation' actions will execute code
//	in the following order:
//		1) pre phase of protocol action (outer)
//		2) implementation action (inner)
//		3) post phase of protocol action (outer)
//	
//	Differences form the base action protocol:
//		- returning undefined from inner will keep the outer return value.
//		  ...this is different from the base action protocol where returning
//		  undefined will get replaces by the context (this), here to 
//		  guarantee returning the context, it should be returned explicitly,
//		  otherwise the responsibility is shifted to the outer action.
//		- returning anything else will override the outer return
//
//	NOTE: this will not affect to protocol/signature of the outer action
//		in any way other than the ability to override the return value.
//	NOTE: both the inner and outer actions will get passed the same 
//		arguments.
//	NOTE: another use-case is testing/debugging actions.
//	NOTE: this is effectively the inside-out of normal action overloading.
//	NOTE: there is intentionally no shorthand for this feature, to avoid 
//		confusion and to discourage the use of this feature unless
//		really necessary.
//
//
// 3) .__call__ action / handler
// 	This action if defined is called for every action called. It behaves
// 	like any other action but with a fixed signature, it always receives 
// 	the action name as first argument and a list of action arguments as
// 	the second arguments, and as normal a result on the post phase.
//
// 	NOTE: it is not necessary to define the actual action, binding to a
// 		handler will also work.
// 	NOTE: one should not call actions directly from within a __call__ 
// 		handler as that will result in infinite recursion.
// 		XXX need a way to prevent this...
// 	NOTE: one should use this with extreme care as this will introduce 
// 		an overhead on all the actions if not done carefully.
//
//
//
/*********************************************************************/
// helpers...

var normalizeTabs = function(str){
	str = str.split(/\n/g)

	// get min number of leading tabs...
	var i = str.length == 2 && /^\t/.test(str[1]) ?
		str[1].split(/^(\t+)/)[1].length - 1
		: Math.min.apply(null, str
			// skip first line...
			.slice(1)
			// skip empty strings...
			.filter(function(l){ return l.trim() != '' })
			// count leading tabs...
			.map(function(l){ 
				return /^\t+/.test(l) ? 
					l.split(/^(\t+)/)[1].length
					: 0}))

	return (str[0] +'\n' 
		+ str
			.slice(1)
			// trim leading tabs...
			.map(function(l){ return l.slice(i) }).join('\n')
			// replace tabs...
			.replace(/\t/g, '    '))
		// remove leading and trailing whitespace...
		.trim()
}


var doWithRootAction = 
module.doWithRootAction = 
function(func){
	return function(){
		var args = args2array(arguments)
		var handlers = (this.getHandlerList 
				|| MetaActions.getHandlerList)
			.apply(this, args)

		return func.apply(this, [handlers.pop()].concat(args))
	}
}



/*********************************************************************/

// Construct an action object...
//
// 	Action(<name>, <function>)
// 	Action(<name>[, <doc>[, <long-doc>]][, <attrs>,] <function>)
// 	Action(<name>, [ [<doc>[, <long-doc>]][, <attrs>,] <function> ])
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
//
// XXX add more metadata/docs:
// 		.section
// 		.category
// 		...
// XXX might be a good idea to add an option to return the full results...
var Action =
module.Action =
function Action(name, doc, ldoc, attrs, func){
	// we got called without a 'new'...
	if(this == null || this.constructor !== Action){
		// XXX using something like .apply(.., arguemnts) would be more
		// 		generel but have no time to figure out how to pass it 
		// 		to new without the later complaining...
		return new Action(name, doc, ldoc, attrs, func)
	}

	// prevent action overloading...
	if(this[name] != null){
		throw 'action "'+name+'" already exists.'
	}

	// create the actual instance we will be returning...
	var meth = function(){
		return meth.chainApply(this, null, arguments) }
	meth.__proto__ = this.__proto__

	// precess args...
	var args = doc instanceof Array ? 
		doc 
		: [].slice.call(arguments)
			.filter(function(e){ return e !== undefined })
			.slice(1)
	func = args.pop()
	last = args[args.length-1]
	attrs = last != null && typeof(last) != typeof('str') ? args.pop() : {}
	doc = typeof(args[0]) == typeof('str') ? args.shift() : null
	ldoc = typeof(args[0]) == typeof('str') ? args.shift() : null

	// populate the action attributes...
	//meth.name = name
	Object.defineProperty(meth, 'name', {
		value: name,
	})
	meth.doc = doc
	meth.long_doc = ldoc

	meth.func = func

	// make introspection be a bit better...
	meth.toString = func.toString.bind(func)

	// setup attrs...
	Object.keys(attrs)
		.forEach(function(k){ meth[k] = attrs[k] })

	return meth
}
// this will make action instances behave like real functions...
Action.prototype.__proto__ = Function

// The pre/post stage runners...
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
// NOTE: All the defaults should be handled by the pre stage, post will 
// 		process data assuming that it is correct.
//
// XXX revise the structure....
// 		...is it a better idea to define action methods in an object 
// 		and assign that???
Action.prototype.pre = function(context, args){
	args = args || []

	var res = context
	var outer = this.name

	// get the handler list...
	var getHandlers = context.getHandlers || MetaActions.getHandlers
	var handlers = getHandlers.call(context, outer)

	// special case: see if we need to handle the call without handlers...
	var preActionHandler = context.preActionHandler || MetaActions.preActionHandler
	if(preActionHandler){
		// XXX signature needs work...
		var res = preActionHandler.call(context, outer, handlers, args)
		if(res !== undefined){
			return res
		}
	}

	var call_wrapper = outer != '__call__' ? 
		getHandlers.call(context, '__call__') 
		: []

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
			return a
		})

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
			return a
		})

	// return context if nothing specific is returned...
	res = res === undefined ? context 
		: res === UNDEFINED ? undefined 
		: res

	return {
		arguments: args,

		wrapper: call_wrapper,
		handlers: handlers,

		result: res,
	}
}
Action.prototype.post = function(context, data){
	var res = data.result

	var args = data.arguments || []
	// the post handlers get the result as the first argument...
	args.splice(0, 0, res)

	var outer = this.name

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

	return res
}

// Chaining...
// 
// For docs see: MetaActions.chainApply(..) and the base module doc.
Action.prototype.chainApply = function(context, inner, args){
	args = [].slice.call(args || [])
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

		// push the inner result into the chian...
		} else if(res !== undefined){
			data.result = res
		}
	}

	return this.post(context, data)
}
Action.prototype.chainCall = function(context, inner){
	return this.chainApply(context, inner, args2array(arguments).slice(2))
}



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

	// Get action attribute...
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
	getActionAttr: function(action, attr){
		var cur = this

		// go up the proto chain...
		while(cur.__proto__ != null){
			if(cur[action] != null){
				// attribute of action...
				if(cur[action][attr] !== undefined){
					return cur[action][attr]

				// attribute of action function...
				} else if(cur[action].func && cur[action].func[attr] !== undefined){
					return cur[action].func[attr]
				}
			}
			cur = cur.__proto__
		}
	},

	// Get action documentation...
	//
	getDoc: function(actions){
		var res = {}
		var that = this
		actions = actions == null ? this.actions
			: arguments.length > 1 ? args2array(arguments)
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
			: arguments.length > 1 ? args2array(arguments)
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
	// XXX EXPERIMENTAL...
	// XXX should we use the toggler object here???
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
	// XXX EXPERIMENTAL...
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
		// handler cache...  XXX EXPERIMENTAL...
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
			// NOTE: this will ignore "shadows" that are not actions...
			if(cur.hasOwnProperty(name) && cur[name] instanceof Action){
				handlers.push(cur[name].func)
			}

			cur = cur.__proto__
		}

		// handler cache... XXX EXPERIMENTAL...
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

				return res
			})
	},

	// Handler for cases when we need to avoid the pre/post handlers...
	//
	// Returns:
	// 	- undefined		- handle the action normally.
	// 	- object		- bypass action handlers.
	//
	// NOTE: the object result must be compatible with Action.pre(..) 
	// 		return value...
	// NOTE: this is mostly a stub, here for documentation reasons...
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
	// NOTE: .chianCall('action', ..) is equivalent to .action.chianCall(..)
	chainApply: function(outer, inner, args){
		return this[outer].chainApply(this, inner, args) },
	chainCall: function(outer, inner){
		return this[outer].chainApply(this, inner, args2array(arguments).slice(2)) },

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
						//|| attr instanceof Function
						|| attr instanceof Action){
					that[k] = attr
				}
				// source tag actions...
				if(source_tag && attr instanceof Action){
					// existing tag...
					if(that[k].source_tag == source_tag || that[k].func.source_tag == source_tag){
						return

					// new tag...
					// XXX not sure if this is the right way to go...
					} else if(that[k].source_tag || that[k].func.source_tag){
						console.warn('Aactions: about to overwrite source tag...\n'
							+'  from: "'+(that[k].source_tag || that[k].func.source_tag)+'"\n'
							+'  to: "'+source_tag+'"\n'
							+'  on:', that[k])
					}

					that[k].func.source_tag = source_tag
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

	// Mixin a set of local actions into an object...
	//
	// XXX this will not work on non-actions...
	mixinTo: function(to, options){
		return this.mixin.call(to, this, options)
	},


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
	// This will find and remove a mixin object from the inheritance chian.
	//
	// NOTE: this will remove only the first occurance of a mixin.
	mixout: function(from){
		var o = this.getMixin(from, true)

		// pop the mixin off the chain...
		if(o != null){
			o.__proto__ = o.__proto__.__proto__
			this.resetHandlerCache()
		}

		return this
	},

	// Remove a set of local mixed in actions from object...
	//
	mixoutFrom: function(to, options){
		return this.mixout.call(to, this, options)
	},

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
	getHandlerDocStr: function(name){
		var lst = this.getHandlers(name)
		var str = ''

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
					// meta...
					+ (cur.pre.event_tag ? 
						normalizeTabs('// Event tag: ' + cur.pre.event_tag) + p : '')
					+ (cur.pre.source_tag ? 
						normalizeTabs('// Source tag: ' + cur.pre.source_tag) + p : '')
					// code...
					+ normalizeTabs(cur.pre.toString()).replace(/\n/g, p)
					+ p
			}

			handler(p + '  |')

			str += p

			if(cur.post){
				str += p + p 
					// meta...
					+ (cur.post.event_tag ? 
						normalizeTabs('// Event source tag: ' + cur.post.event_tag) + p : '')
					+ (cur.post.source_tag ? 
						normalizeTabs('// Source tag: ' + cur.post.source_tag) + p : '')
					// code...
					+ normalizeTabs(cur.post.toString()).replace(/\n/g, p)
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
						normalizeTabs('// Event tag: ' + cur.pre.event_tag) + p : '')
					+ (cur.pre.source_tag ? 
						normalizeTabs('// Source tag: ' + cur.pre.source_tag) + p : '')
					// code...
					+ normalizeTabs(cur.pre.toString())
						.replace(/return/g, '<b>return</b>')))
			}

			handler(p)

			if(cur.post){
				p.append($('<pre>').html(
					// meta...
					(cur.post.event_tag ? 
						normalizeTabs('// Event source tag: ' + cur.post.event_tag) + p : '')
					+ (cur.post.source_tag ? 
						normalizeTabs('// Source tag: ' + cur.post.source_tag) + p : '')
					// code...
					+ normalizeTabs(cur.post.toString())))
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
object.makeConstructor('ActionSet', MetaActions)



// An action set...
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
// 			<function>
// 		],
//
// 		// short doc only...
// 		<name> : [
// 			<doc>,
// 			<function>
// 		],
//
// 		// only the code...
// 		<name> : [
// 			<function>
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
var Actions =
module.Actions =
function Actions(a, b){
	var obj = b == null ? a : b
	var proto = b == null ? b : a
	obj = obj || new ActionSet()

	// NOTE: this is intentionally done only for own attributes...
	Object.keys(obj).forEach(function(k){
		// NOTE: we are not getting the attrs directly (vars = obj[k])
		// 		as that will trigger the getters on an object that is
		// 		not in a consistent state...
		// NOTE: this will skip all the getters and setters, they will 
		// 		be included as-is...
		var arg = Object.getOwnPropertyDescriptor(obj, k).value

		// skip non-arrays...
		if(arg == null 
				// XXX node?: for some magical reason when running this 
				// 		from node console instanceof tests fail...
				//|| !(arg instanceof Array)
				|| arg.constructor.name != 'Array'
				// and arrays the last element of which is not a function...
				|| typeof(arg[arg.length-1]) != 'function'){
				//|| !(arg[arg.length-1] instanceof Function)){
			return
		}

		// create a new action...
		var a = obj[k] = new Action(k, arg)
	})

	if(proto != null){
		obj.__proto__ = proto

		// XXX is this the right way to go???
		if(obj.config != null && proto.config != null){
			obj.config.__proto__ = proto.config
		}
	}

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
	var args = [].slice.call(arguments)
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
