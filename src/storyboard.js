/* global _ */

(function(global, _) {

  /**
   * @namespace
   */
  var Miso = global.Miso = (global.Miso || {});

  /**
   * Creates a new storyboard.
   *
   * @constructor
   * @name Storyboard
   * @memberof Miso
   *
   * @param {Object} [options]
   * @param {Object} [options.context] - Set a different context for the
   *                                     storyboard.  by default it's the scene
   *                                     that is being executed.
   */
  var Storyboard = Miso.Storyboard = function(options) {

    options = options || {};

    // save all options so we can clone this later...
    this._originalOptions = options;

    // Set up the context for this storyboard. This will be
    // available as "this" inside the transition functions.
    this._context = options.context || this;

    // Assign custom id to the storyboard.
    this._id = _.uniqueId("scene");

    // If there are scenes defined, initialize them.
    if (options.scenes) {

      // if the scenes are actually just set to a function, change them
      // to an enter property
      _.each(options.scenes, function(scene, name) {
        if (typeof scene === "function") {
          options.scenes[name] = {
            enter : scene
          };
        }
      });

      // make sure enter/exit are defined as passthroughs if not present.
      _.each(Storyboard.HANDLERS, function(action) {
        options.scenes[action] = options.scenes[action] || function() { return true; };
      });

      // Convert the scenes to actually nested storyboards. A "scene"
      // is really just a storyboard of one action with no child scenes.
      this._buildScenes(options.scenes);

      // Save the initial scene that we will start from. When .start is called
      // on the storyboard, this is the scene we transition to.
      this._initial = options.initial;

      // Transition function given that there are child scenes.
      this.to = children_to;

    } else {

      // This is a terminal storyboad in that it doesn't actually have any child
      // scenes, just its own enter and exit functions.

      this.handlers = {};

      _.each(Storyboard.HANDLERS, function(action) {

        // save the enter and exit functions and if they don't exist, define them.
        options[action] = options[action] || function() { return true; };

        // wrap functions so they can declare themselves as optionally
        // asynchronous without having to worry about deferred management.
        this.handlers[action] = wrap(options[action], action);

      }.bind(this));

      // Transition function given that this is a terminal storyboard.
      this.to = leaf_to;
    }


    // Iterate over all the properties defiend in the options and as long as they 
    // are not on a black list, save them on the actual scene. This allows us to define
    // helper methods that are not going to be wrapped (and thus instrumented with 
    // any deferred and async behavior.)
    _.each(options, function(prop, name) {

      if (_.indexOf(Storyboard.BLACKLIST, name) !== -1) {
        return;
      }

      if (_.isFunction(prop)) {
        this[name] = (function(contextOwner) {
          return function() {
            prop.apply(contextOwner._context || contextOwner, arguments);
          };
        }(this));
      } else {
        this[name] = prop;
      }

    }.bind(this));

  };

  Storyboard.HANDLERS = ["enter","exit"];
  Storyboard.BLACKLIST = ["_id", "initial","scenes","enter","exit","context","_current"];

  _.extend(Storyboard.prototype, Miso.Events,
    /**
     * @lends Miso.Storyboard.prototype
     */
    {

    /**
     * Allows for cloning of a storyboard
     *
     * @returns {Miso.Storyboard}
     */
    clone : function() {

      // clone nested storyboard
      if (this.scenes) {
        _.each(this._originalOptions.scenes, function(scene, name) {
          if (scene instanceof Miso.Storyboard) {
            this._originalOptions.scenes[name] = scene.clone();
          }
        }, this);
      }

      return new Miso.Storyboard(this._originalOptions);
    },

    /**
     * Attach a new scene to an existing storyboard.
     *
     * @param {String} name - The name of the scene
     * @param {Miso.Storyboard} parent - The storyboard to attach this current
     *                                   scene to.
     */
    attach : function(name, parent) {

      this.name = name;
      this.parent = parent;

      // if the parent has a custom context the child should inherit it
      if (parent._context && (parent._context._id !== parent._id)) {

        this._context = parent._context;
        if (this.scenes) {
          _.each(this.scenes , function(scene) {
            scene.attach(scene.name, this);
          }.bind(this));
        }
      }
      return this;
    },

    /**
     * Instruct a storyboard to kick off its initial scene.
     * If the initial scene is asynchronous, you will need to define a .then
     * callback to wait on the start scene to end its enter transition.
     *
     * @returns {Deferred}
     */
    start : function() {
      // if we've already started just return a happily resoved deferred
      if (typeof this._current !== "undefined") {
        return _.Deferred().resolve();
      } else {
        return this.to(this._initial);
      }
    },

    /**
     * Cancels a transition in action. This doesn't actually kill the function
     * that is currently in play! It does reject the deferred one was awaiting
     * from that transition.
     */
    cancelTransition : function() {
      this._complete.reject();
      this._transitioning = false;
    },

    /**
     * Returns the current scene.
     *
     * @returns {String|null} current scene name
     */
    scene : function() {
      return this._current ? this._current.name : null;
    },

    /**
     * Checks if the current scene is of a specific name.
     *
     * @param {String} scene - scene to check as to whether it is the current
     *                         scene
     *
     * @returns {Boolean} true if it is, false otherwise.
     */
    is : function( scene ) {
      return (scene === this._current.name);
    },

    /**
     * @returns {Boolean} true if storyboard is in the middle of a transition.
     */
    inTransition : function() {
      return (this._transitioning === true);
    },

    /**
     * Allows the changing of context. This will alter what "this" will be set
     * to inside the transition methods.
     */
    setContext : function(context) {
      this._context = context;
      if (this.scenes) {
        _.each(this.scenes, function(scene) {
          scene.setContext(context);
        });
      }
    },

    _buildScenes : function( scenes ) {
      this.scenes = {};
      _.each(scenes, function(scene, name) {
        this.scenes[name] = scene instanceof Miso.Storyboard ? scene : new Miso.Storyboard(scene);
        this.scenes[name].attach(name, this);
      }, this);
    }
  });

  // Used as the to function to scenes which do not have children
  // These scenes only have their own enter and exit.
  function leaf_to( sceneName, argsArr, deferred ) {

    this._transitioning = true;
    var complete = this._complete = deferred || _.Deferred(),
    args = argsArr ? argsArr : [],
    handlerComplete = _.Deferred()
      .done(_.bind(function() {
        this._transitioning = false;
        this._current = sceneName;
        complete.resolve();
      }, this))
      .fail(_.bind(function() {
        this._transitioning = false;
        complete.reject();
      }, this));

    this.handlers[sceneName].call(this._context, args, handlerComplete);

    return complete.promise();
  }

    // Used as the function to scenes that do have children.
  function children_to( sceneName, argsArr, deferred ) {
    var toScene = this.scenes[sceneName],
        fromScene = this._current,
        args = argsArr ? argsArr : [],
        complete = this._complete = deferred || _.Deferred(),
        exitComplete = _.Deferred(),
        enterComplete = _.Deferred(),
        publish = _.bind(function(name, isExit) {
          var sceneName = isExit ? fromScene : toScene;
          sceneName = sceneName ? sceneName.name : "";

          this.publish(name, fromScene, toScene);
          if (name !== "start" || name !== "end") {
            this.publish(sceneName + ":" + name);
          }

        }, this),
        bailout = _.bind(function() {
          this._transitioning = false;
          this._current = fromScene;
          publish("fail");
          complete.reject();
        }, this),
        success = _.bind(function() {
          publish("enter");
          this._transitioning = false;
          this._current = toScene;
          publish("end");
          complete.resolve();
        }, this);


    if (!toScene) {
      throw "Scene \"" + sceneName + "\" not found!";
    }

    // we in the middle of a transition?
    if (this._transitioning) {
      return complete.reject();
    }

    publish("start");

    this._transitioning = true;

    if (fromScene) {

      // we are coming from a scene, so transition out of it.
      fromScene.to("exit", args, exitComplete);
      exitComplete.done(function() {
        publish("exit", true);
      });

    } else {
      exitComplete.resolve();
    }

    // when we're done exiting, enter the next set
    _.when(exitComplete).then(function() {

      toScene.to(toScene._initial || "enter", args, enterComplete);

    }).fail(bailout);

    enterComplete
      .then(success)
      .fail(bailout);

    return complete.promise();
  }

  function wrap(func, name) {

    //don't wrap non-functions
    if ( !_.isFunction(func)) { return func; }
    //don't wrap private functions
    if ( /^_/.test(name) ) { return func; }
    //don't wrap wrapped functions
    if (func.__wrapped) { return func; }

    var wrappedFunc = function(args, deferred) {
      var async = false,
          result;

          deferred = deferred || _.Deferred();

          this.async = function() {
            async = true;
            return function(pass) {
              return (pass !== false) ? deferred.resolve() : deferred.reject();
            };
          };

      result = func.apply(this, args);
      this.async = undefined;
      if (!async) {
        return (result !== false) ? deferred.resolve() : deferred.reject();
      }
      return deferred.promise();
    };

    wrappedFunc.__wrapped = true;
    return wrappedFunc;
  }

}(this, _));
