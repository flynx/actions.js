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
  via the mixin methods or `mix` function are properties and actions, 
  all data, including normal methods is discarded.  
  _(this is not final)_


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
Actions                         o-------x       o-------x
                                        v       ^
Root Action                             o---|---x

```

- a method, created by `Action(..)`,
- calls all the shadowed/overloaded actions in the inheritance 
  chain in sequence implicitly,  
  **Notes:**   
    - there is no way to prevent an action in the chain from
		  running, this is by design, i.e. no way to fully shadow.
- actions that do not shadow anything are called _base_ or _root actions_.
- returns the action set (`this`) by default (for call chaining),
- the base/root action can return any value.  
  **Notes:**  
    - if undefined is returned, it will be replaced by the 
		  action context/action set.
    - there is no distinction between root and other actions
		  other than that root action's return values are not 
		  ignored.
- can consist of two parts: the first is called before the 
  shadowed action (_pre-callback_) and the second after (_post-callback_).
- post-callback has access to the return value and can modify it
  but not replace it.
- can be bound to, a-la an event, calling the handlers when it is 
  called (_see below_), 


**Action (event) handler**

When `action_set` object is inherited from a `ActionSet` object or 
from `MetaActions`:
```javascript
action_set.on('action_name', function(){
  // post code...
})

action_set.on('action_name.post', function(){
  // post code...
})


action_set.on('action_name.pre', function(){
  // pre code...
})
```

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

By default `Actions(..)` defines no additional methods. Most of the API
methods are defined in `MetaActions` and can be optionally inherited 
from an instance of `ActionSet`. In general this includes all
`ActionSet / object` level methods while anything accessible from the 
_action_ is build-in.

1. Documentation generation and introspection (`MetaActions`)

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


2. Event-like callbacks for actions (`MetaActions`, `Action`)

  ```
  <action-set>.on('action', function(){ ... })
  <action-set>.on('action.post', function(){ ... })

  <action-set>.on('action.pre', function(){ ... })
  ```


3. A mechanism to define and extend already defined actions
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



<!-- vim:set ts=4 sw=4 spell : -->
