# Features / Actions

The Feature / Action couple is meta-programming library that helps with:
- extending and calling methods (Actions) on object inheritance chains
- managing and applying sets of methods (Features) to objects (a-la _mixin_)




## Actions

Actions are an extension to the JavaScript object model tailored for
a set of specific tasks.


### Goals:
- Provide a unified mechanism to define and manage user API's for 
  use in UI-hooks, keyboard mappings, scripting, ... etc.
- A means to generate configuration UI's
- A means to generate documentation


### Restrictions:
- **No method shadowing**  
  The _extending_ action can not "shadow" the _extended_ action in a 
  non destructive manner (e.g. via a throw), all actions in a chain are 
  guaranteed to be called, unless a fatal error condition.
- **No argument shadowing**  
  The _extending_ has access to all the arguments that the user passed
  but can not modify or reformat them before the _extended_ action gets
  them.
- **No return shadowing**  
  The _extending_ action can not replace the object returned by the 
  _extended_ action, though it can _coopiratively_ update/modify it if 
  needed
- **Single return point**
  Only the _root_ action can return a value, any other returns by 
  _extending_ actions are ignored
- The default return value is `this`


### The main entities:

**Action set**
- an object containing a number of actions,
- optionally, directly or indirectly inherited from `MetaActions`
  and/or other action sets,
- the action handlers are bound relative to it (`._action_handlers`)


**Action**

```
                        +  pre  +  pre  +       +  post +  post +
Action event handler:   o-------x                       o-------x
                                v                       ^
Actions                         o-------x       o-------x
                                        v       ^
Root Action                             o---|---x

```

- a method, created by `Action(..)`,
- calls all the shadowed/overloaded actions in the inheritance 
  chain in sequence implicitly,
  NOTE: there is no way to prevent an action in the chain from
		running, this is by design, i.e. no way to fully shadow.
- actions that do not shadow anything are called root actions.
- returns the action set by default (for call chaining),
- the base/root action can return any value.
  NOTE: if undefined is returned, it will be replaced by the 
		action context/action set.
  NOTE: there is no distinction between root and other actions
		other than that root action's return values are not 
		ignored.
- can consist of two parts: the first is called before the 
  shadowed action (pre-callback) and the second after (post-callback).
- post-callback has access to the return value and can modify it
  but not replace it.
- can be bound to, a-la an event, calling the handlers when it is 
  called, 


**Action (event) handler**
- a function,
- can be bound to run before and/or after the action itself,
- is local to an action set it was bound via,
- when an action is triggered from an action set, all the pre 
  handlers in its inheritance chain will be called before the 
  respective actions they are bound to and all the post handlers
  are called directly after.
- pre handlers are passed the same arguments the original actions
  got when it was called.
- post action handlers will get the root action result as first 
  argument succeeded by the action arguments.



### The action system main protocols:

1. Documentation generation and introspection (`MetaActions`)

  ```
  <action>.toString()
      -> code of original action function

  <action-set>.getDoc()
  <action-set>.getDoc(<action-name>[, ..])
      -> dict of action-name, doc

  <action-set>.a.getHandlerDocStr(<action-name>)
      -> formated string of action handlers

  <action-set>.actions
      -> list of action names

  <action-set>.length
      -> number of actions
  ```


2. Event-like callbacks for actions (`MetaActions`, `Action`)

  ```
  <action-set>.on('action', function(){ ... })
  <action-set>.on('action.post', function(){ ... })

  <action-set>.on('action.pre', function(){ ... })
  ```


3. A mechanism to define and extend already defined actions
	This replaces / complements the standard JavaScript overloading 
	mechanisms (`Action`, `Actions`)

  ```
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

1. A mechanism to manually call the pre/post stages of an action

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
  - there is not reliable way to call the post phase without first
    calling the pre phase due to how the pre phase is defined (i.e.
    pre phase functions can return post phase functions).


2. A mechanism to chain/wrap actions or an action and a function.
	This enables us to call a callback or another action (inner) between 
	the root action's (outer) pre and post stages.

  ```
  Outer action                o-------x       o-------x
                                      v       ^
  Inner action/callback               o---|---x
  ```

  A trivial example:

  ```
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

  ```
  // Protocol root action (outer) definition...
  protocolAction: [function(){}],

  // Implementation actions (inner)...
  implementationAction1: [function(){
    return this.protocolAction.chainApply(this, function(){
      // ...
    }, ..)
  }]

  implementationAction2: [function(){
    return this.protocolAction.chainApply(this, function(){
      // ...
    }, ..)
  }]
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


3. `.__call__` action / handler

	This action if defined is called for every action called. It behaves
	like any other action but with a fixed signature, it always receives 
	the action name as first argument and a list of action arguments as
	the second arguments, and as normal a result on the post phase.

  **Notes:**
	- it is not necessary to define the actual action, binding to a
		handler will also work.
	- one should not call actions directly from within a __call__ 
		handler as that will result in infinite recursion.
		XXX need a way to prevent this...
	- one should use this with extreme care as this will introduce 
		an overhead on all the actions if not done carefully.



## Features

Features is a module that helps build _features_ out of sets of actions
and manage sets of features according to external criteria and 
feature-feature dependencies.

### Goals:

XXX

### The main entities:

**Feature**

XXX


**FeatureSet (Features)**

XXX



<!-- vim:set ts=4 sw=4 spell : -->
