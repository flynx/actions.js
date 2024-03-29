# Actions

Actions are an extension to the JavaScript object model tailored for
a set of specific tasks.

To distinguish this from the native JavaScript elements we introduce new
terminology, an _action_ is an extended _method_ while an _action set_ is
a _mixin object_ (stateless, including only functionality) both usable 
stand-alone as well as _mixed_ into other objects.

Here is a trivial use-case to illustrate the motivation for this tool set:


#### The problem:

```javascript
var N = {
    times: function(n){
        this.value *= n
        return this
    }
}

var n = Object.create(N)

n.value = 3

n
    .times(3)
    .times(2)

```

To extend this object we'll need to:

```javascript
n.times = function(n){
    console.log(this.value, 'times', n)

    var res = N.times.call(this, n)

    console.log('    ->', this.value)
    return res
}

```

Note that we are manually calling the _super_ method and manually 
returning and re-returning `this` in each implementation of `.times(..)`.

Another thing to note here is that the code above, though quite simple is
not reusable, i.e.:
- we can't simply use the extending method for any other parent unless we
  either copy/rewrite it or complicate the code.
  ES5/ES6 only partially fixes this issue as `super` can only be used in 
  some cases (literal methods) and not others (functions and functions as
  methods) which complicates things and makes them non-uniform. 
- we can't use the extending method stand-alone, for example for testing

It is possible to go around these issues but not without introducing
complicated and/or redundant code, _Actions_ implements one approach to
abstract this...


#### The solution:


```javascript
var N = Actions({
    // Notice the brackets around the function...
    times: [function(n){
        this.value *= n
    }]
})

// Now we extend .times(..)
var ExtendedN = Actions({
    times: [function(n){
        console.log(this.value, 'times', n)

        return function(){
            console.log('    ->', this.value)
        }
    }]
})

```

And both objects can be used in the same way as before:


```javascript
var n = mix(N, ExtendedN) // or Object.create(N) or Object.create(ExtendedN)...

n.value = 3

n
    .times(3)
    .times(2)
```

- `this` is returned automatically enabling us to chain calls to `.times(..)`
- the _super_ method is resolved and called automatically
- both `N` and `ExtendedN` are independent of each other and reusable 
  in different inheritance chains without any extra work needed.
- _and more... (see below)_


### What we get:
- **Call parent (_extended_) actions automatically**  
  All actions (methods) in a chain are guaranteed to get called if the 
  action is called.
- **Thread arguments up the call chain**  
  All actions in a chain will get the set of arguments passed to the 
  action when called.
- **Thread the return value down the call chain**  
  The return value will get passed through all the actions in a chain 
  before returning to the action caller.
- **Return `this` by default**
- **Organise and reuse actions**  
  Actions organized into action sets can be reused (_mixed-in_) in multiple
  inheritance chains without any extra work.
- **Unified way to document actions**
- **Introspection and inspection API**


### Restrictions comparing to native JavaScript:
- **No method shadowing**  
  The _extending_ action can not "shadow" the _extended_ action in a 
  non destructive manner (e.g. via a `throw`), all actions in a chain are 
  guaranteed to be called, unless a fatal error condition.
- **No argument shadowing**  
  The _extending_ action has access to all the arguments that the user 
  passed but can not modify or reformat them before the _extended_ action
  gets them.
- **No return shadowing / Single return point**  
  The _extending_ action can not replace the object returned by the 
  _extended_ action, though it can _cooperatively_ update/modify it if 
  needed.
  Only the _root_ action can return a value, any other returns in chain
  are ignored
- **No state transferred via mixin**  
  The only two things _inherited_ from the object defining the actions 
  via the mixin methods or `mix` function are properties and methods/actions, 
  all data is discarded.  


**Notes:**
- By design this tool-set promotes a _cooperative_ model and makes it
  hard to change/modify existing signatures / _contracts_ in _extending_ 
  code, hence the restrictions.
- `mix(..)` and the `.mix*(..)` (MetaActions/ActionSet) method family 
  usually copy references to actions to the target object, this is done 
  to go around the lack of multiple inheritance support in JavaScript 
  and to enable clean action set reuse.
- `mix(..)` _mixes_ actions in order, i.e. later overloads the former,
  this is not the same as the traditional multiple inheritance order in 
  languages such as Python where the order is reversed.


## Index
- [Actions](#actions)
      - [The problem:](#the-problem)
      - [The solution:](#the-solution)
    - [What we get:](#what-we-get)
    - [Restrictions comparing to native JavaScript:](#restrictions-comparing-to-native-javascript)
  - [Index](#index)
    - [The main entities:](#the-main-entities)
    - [The action system main protocols:](#the-action-system-main-protocols)
      - [1. Documentation generation and introspection (`MetaActions`)](#1-documentation-generation-and-introspection-metaactions)
      - [2. Event-like callbacks for actions (`MetaActions`, `Action`)](#2-event-like-callbacks-for-actions-metaactions-action)
      - [3. A mechanism to define and extend already defined actions](#3-a-mechanism-to-define-and-extend-already-defined-actions)
    - [Secondary action protocols:](#secondary-action-protocols)
      - [1. A mechanism to manually call the pre/post stages of an action](#1-a-mechanism-to-manually-call-the-prepost-stages-of-an-action)
      - [2. A mechanism to chain/wrap actions or an action and a function.](#2-a-mechanism-to-chainwrap-actions-or-an-action-and-a-function)
      - [3. `.__actioncall__` action / handler](#3-__actioncall__-action--handler)
      - [4. Action attributes](#4-action-attributes)
      - [5. Pre-call testing if an action can be called](#5-pre-call-testing-if-an-action-can-be-called)
      - [6. Scheduling a call after the running action](#6-scheduling-a-call-after-the-running-action)
      - [7. Calling action handlers sorted independently of the prototype chain](#7-calling-action-handlers-sorted-independently-of-the-prototype-chain)
    - [Alias protocols:](#alias-protocols)
  - [License](#license)


### The main entities:


**Action set**
```javascript
var empty_full = new ActionSet()

var minimal = Actions({
    // action and prop definitions...
})

var full = Actions(ActionSet(), {
    // ...
})

var inherited = Actions(full, {
    // ...
})
```

- an object containing a number of actions,
- optionally, directly or indirectly inherited from `MetaActions`
  and/or other action sets,
- the action handlers are bound relative to it (`._action_handlers`)


**Action**

Defined inside an action-set:
```javascript
    // ...

    minimal: [function(){
        // ...
    }],

    full: ['Short info string',
        'Long documentation string, describing the action (optional)',
        function(){
            // pre code
            //    run before the parent action...
    
            return function(res){
                // post code
                //     run after the parent action or directly after 
                //     the pre-code of this is the root action...
            }
        }],

    // ...
```


The call diagram:
```
                        +  pre  +  pre  +       +  post +  post +
Action event handler:   o-------x                       o-------x
                                v                       ^
Actions:                        o-------x       o-------x
                                        v       ^
Root Action:                            o---|---x

```

- `Action(..)` creates a method (an _action_),
- an _action_ calls all the shadowed/overloaded actions in the inheritance 
  chain in sequence implicitly,  
  **Notes:**   
    - there is no way to prevent an action in the chain from
		  running, this is by design, i.e. no way to fully shadow.
- top actions in the inheritance chain are called _base_ or _root actions_.
- an action returns the action set (`this`) by default (for call chaining),
- the base/root action can return any value.  
  **Notes:**  
    - if undefined is returned, it will be replaced by the 
		  action context/action set,
	- if a function is returned it is treated as a post phase action,
	- to return a reserved value (undefined, function) wrap it in 
		  `actions.ASIS(..)`
	- any other return value is returned as-is,
    - there is no distinction between root and other actions
		  other than that root action's return values are not 
		  ignored.
- if the root action returns a `Promise`, the post phase is run 
  when that promise is resolved or rejected. This can be disabled by 
  setting the 'await' action attribute to `false` (default: `true`).
- an action can consist of two parts: the first is called before the 
  next action in chain (_pre-callback_) and the second after (_post-callback_).
- post-callback has access to the return value and can modify it
  but not replace it.
- an action can be bound to, a-la an event, calling the handlers when it is 
  called (_see below_), 


**Action (event) handler**

When `actionSet` object is inherited from a `ActionSet` object or 
from `MetaActions`:
```javascript
actionSet.on('action_name', function(){
    // post code...
})

actionSet.on('action_name.post', function(){
    // post code...
})


actionSet.on('action_name.pre', function(){
    // pre code...
})
```

- a handler is a function,
- it can be bound to run before and/or after the action itself,
- it is local to an action set it was bound via,
- when an action is triggered from an action set, all the pre 
  handlers in its inheritance chain will be called before the 
  respective actions they are bound to and all the post handlers
  are called directly after.
- pre handlers are passed the same arguments the original actions
  got when it was called.
- post action handlers will get the root action result as first 
  argument succeeded by the action arguments.


**Alias**

```javascript
    fullAlias: ['Alias to .full(..) action...',
        `This alias will call the .full(..) action and pass it a couple of
        arguments`,
        // the alias code...
        'full: "argument" 1'],
```

- an action created by `Alias(..)`,
- identical to an action with one key difference: instead of a 
  function `Alias(..)` expects a string/code,
- code syntax is configurable, defaulting to the defined by
  `parseActionCall(..)`,
- aliases are designed to be defined and managed in runtime while
  actions are mainly load-time entities.


<!-- XXX add doc about the code format... -->


### The action system main protocols:

By default `Actions(..)` defines no additional methods. Most of the API
methods are defined in `MetaActions` and can be optionally inherited 
from an instance of `ActionSet`. In general this includes all
`ActionSet / object` level methods while anything accessible from the 
_action_ is build-in.

#### 1. Documentation generation and introspection (`MetaActions`)

```
<action>.toString()
    -> code of original action function

<action-set>.getDoc()
<action-set>.getDoc(<action-name>[, ..])
    -> dict of action-name, doc

<action-set>.getHandlerDocStr(<action-name>)
    -> formated string of action handlers

<action-set>.actions
    -> list of action names
```


#### 2. Event-like callbacks for actions (`MetaActions`, `Action`)

```
<action-set>.on('action', function(){ ... })
<action-set>.on('action.post', function(){ ... })

<action-set>.on('action.pre', function(){ ... })
```


#### 3. A mechanism to define and extend already defined actions

This replaces / complements the standard JavaScript overloading 
mechanisms (`Action`, `Actions`)

```javascript
// Actions...
var X = Actions({
    m: [function(){ console.log('m') }]
})
var O = Actions(X, {
    m: [function(){
        console.log('pre')
        return function(res){
            console.log('post')
        }
    }]
})
```

**Notes:**
- what is done here is similar to calling `O.__proto__.m.call(..)`
  but is implicit, and not dependant on the original containing 
  object name/reference (`O`), thus enabling an action to be 
  referenced and called from any object and still chain correctly.



### Secondary action protocols:

#### 1. A mechanism to manually call the pre/post stages of an action

Pre phase...
```
<action>.pre(<context>)
<action>.pre(<context>, [<arg>, ..])
    -> <call-data>
```

Post phase...
```
<action>.post(<context>, <call-data>)
    -> <result>
```

This is internally used to implement the action call as well as the
chaining callbacks (see below).

All action protocol details apply.

**Notes:**
- there is no reliable way to call the post phase without first
  calling the pre phase due to how the pre phase is defined (i.e.
  pre phase functions can return post phase functions).


#### 2. A mechanism to chain/wrap actions or an action and a function.
This enables us to call a callback or another action (inner) between 
the root action's (outer) pre and post stages.

```
Outer action                o-------x       o-------x
                                    v       ^
Inner action/callback               o---|---x
```

A trivial example:

```javascript
actionSet.someAction.chainApply(actionsSet, 
    function(){
        // this gets run between someAction's pre and post 
        // stages...
    }, 
    args)
```

This is intended to implement protocols where a single action is
intended to act as a hook point (outer) and multiple different 
implementations (inner) within a single action set can be used as
entry points.

```javascript
    // Protocol root action (outer) definition...
    protocolAction: [function(){}],

    // Implementation actions (inner)...
    implementationAction1: [function(){
        return this.protocolAction.chainApply(this, function(){
            ...
        }, ..)
    }],

    implementationAction2: [function(){
        return this.protocolAction.chainApply(this, function(){
            ...
        }, ..)
    }],
```

Now calling any of the 'implementation' actions will execute code
in the following order:
1. pre phase of protocol action (outer)
2. implementation action (inner)
3. post phase of protocol action (outer)

**Notes:**
- this will not affect to protocol/signature of the outer action
  in any way.
- both the inner and outer actions will get passed the same 
  arguments.
- another use-case is testing/debugging actions.
- this is effectively the inside-out of normal action overloading.
- there is intentionally no shorthand for this feature, to avoid 
  confusion and to discourage the use of this feature unless
  really necessary.


#### 3. `.__actioncall__` action / handler

This action if defined is called for every action called. It behaves
like any other action but with a fixed signature, it always receives 
the action name as first argument and a list of action arguments as
the second arguments, and as normal a result on the post phase.

**Notes:**
- it is not necessary to define the actual action, binding to a
  handler will also work.
- one should not call actions directly from within a __actioncall__ 
  handler as that will result in infinite recursion.  
- one should use this with extreme care as this will introduce 
  an overhead on all the actions if not done carefully.


#### 4. Action attributes

Setting action attributes:
```javascript
    someAction: [
        {attr: 'value', .. },
        function(){
            ...
        }],

```

Attribute access:
```
<action-set>.getActionAttr('action', 'attr')
    -> <value>

<action-set>.getActionAttrAliased('action', 'attr')
    -> <value>

<action-set>.getRootActionAttr('action', 'attr')
    -> <value>
```


#### 5. Pre-call testing if an action can be called

A pre call test is called before the action's pre handlers are called and if 
it returns anything truthy the action is not called and that return value is 
returned instead.

To return a falsey value wrap it in `actions.ASIS(..)`

Only the top-most pre call test is called.

Defining a pre call test:
```javascript
    someAction: [
        {precall: actions.debounce(200, true)},
        function(){
            ...
        }],
```

The test is called in the context of the `<action-set>`
```
<pre-call-test>(<action>, ...)
    -> undefined
    -> <value>
```


#### 6. Scheduling a call after the running action

This enables the action code to schedule a call after the current 
action level or the root action is done.

```
<action-set>.afterAction(func)
<action-set>.afterAction('top', func)
    -> this

<action-set>.afterAction('local', func)
    -> this
```

Example:
```javascript
    someAction: [
        function(){
            ...

            // the function passed will get called after the root action 
            // and all it's handlers are done.
            this.afterAction(function(){ ... })

            ...
        }],
```

**Notes:** 
- The functions are executed in order of registration.
- This is pointless outside of an action call, thus an exception will be thrown.


#### 7. Calling action handlers sorted independently of the prototype chain

This sorts action handlers by priority `.sortedActionPriority` then 
order and calls them.

This protocol enables us to call actions in a deterministic order 
independent of the order the handlers are defined in the prototype chain.

```
<action-set>.callSortedAction(name, ...args)
	-> this
```

Example action:
```javascript
    someAction: [
        { sortedActionPriority: 'high' },
        function(){
            ...
        }],
```

`sortedActionPriority` can take the following values:
- *number*
- `'high'` (equivalent to `50`)
- `'normal'` (equivalent to `0`)
- `'low'` (equivalent to `-50`)

The greater the priority the earlier the handler is called. Handlers with 
prioorities greater than `0` will always precede the unprioretized (i.e. 
`.sortedActionPriority` unset, `null` or `0`) handlers; Handlers with 
prioorities less than `0` will always follow the unprioretized handlers. 
Unprioretized handlers keep their relative order.

**Notes:** 
- `.callSortedAction(..)` ignores handler return values by design. This is 
done to prevent actions competing to return a value.
- if action name does not exist this will do nothing and return normally 
(without error)...



### Alias protocols:

1. Defining aliases in runtime (MetaActions)

  An alias is a mechanism to call an action (or alias) passing it a fixed
  set of arguments.

  ```
  <action-set>.alias('alias', 'action: args')
  <action-set>.alias('alias', .., 'action: args')
      -> <action-set>
  ```

  Aliases can be defined inline:
  ```
  someAction: [
  	'action: arg'],
  ```

  Alias code syntax:
  ```BNF
  ALIAS ::= 
      <action-name>
      | <action-name>: <args>
      | <action-name>: <args> <comment>
  <args> ::=
      <arg>
      | <arg> <args>
  <arg> ::=
      Number|String|Array|Object
      | IDENTIFIER
      | ...
      | '$[0-9]'
  <comment> ::=
      '--.*$'
 			
  ```

  Special arguments:
  - *IDENTIFIER*  
    expanded to `context[IDENTIFIER]`
  - *$N*  
    expanded to an instance of `parseStringAction.Argument`
  - *...*  
    expanded to `parseStringAction.ALLARGS` (singleton)
 			

  Example:
  ```javascript
  go: [
      function(direction, ...opts){
          // ...
      }],

  // aliases to go...
  north: ['go: "north" -- Go north...'], 
  south: ['go: "south" -- Go south...'], 
  east: ['go: "east" -- Go east...'], 
  west: ['go: "west" -- Go west...'], 

  ```
	
	
  **Notes:** 
  - `.alias(..)` is signature compatible to `Action(..)` / `Alias(..)`,
	supporting all the documentation and attribute definition.
  - To enable extending in runtime .alias(..) itself is implemented as 
    an action, thus all action protocols also apply.


2. Deleting aliases in runtime (MetaActions)

  ```
  <action-set>.alias('alias', null)
  <action-set>.alias('alias', false)
      -> <action-set>
  ```
  			
  **Notes:**
  - only own aliases can be deleted via .alias(.., null|false)


3. Documentation generation and introspection (MetaActions, Alias)

  Alias code...
  ```
  <alias>.alias
  <alias>.toString()
      -> <code>
  ```

  List own aliases...
  ```
  <action-set>.aliases
      -> <action-set>
  ```
			


<!-- XXX need docs on mix(..) and .mix*(..) protocols... -->


## License

[BSD 3-Clause License](./LICENSE)

Copyright (c) 2018-2023, Alex A. Naanou,
All rights reserved.

<!-- vim:set ts=4 sw=4 spell : -->
