/* global _ */
(function(global, _) {

  var Miso = global.Miso = (global.Miso || {});

  /**
   * Miso Events is a small set of methods that can be mixed into any object to
   * make it evented. It allows one to then subscribe to specific object
   * events, to publish events, unsubscribe and subscribeOnce.
   *
   * @namespace Events
   * @memberof Miso
   */
  Miso.Events =
    /** @lends Miso.Events */
    {

    /**
     * Triggers a specific event and passes any additional arguments
     * to the callbacks subscribed to that event.
     *
     * @param {String} name - the name of the event to trigger
     * @param {...mixed} - any additional arguments to pass to callbacks.
     */
    publish : function(name) {
      var args = _.toArray(arguments);
      args.shift();

      if (this._events && this._events[name]) {
        _.each(this._events[name], function(subscription) {
          subscription.callback.apply(subscription.context || this, args);
        }.bind(this));
      }
      return this;
    },

    /**
     * Allows subscribing on an evented object to a specific name.  Provide a
     * callback to trigger.
     *
     * @param {String} name - event to subscribe to
     * @param {Function} callback - callback to trigger
     * @param {Object} [options]
     * @param {Number} [options.priority] - allows rearranging of existing
     *                                      callbacks based on priority
     * @param {Object} [options.context] - allows attaching diff context to
     *                                     callback
     * @param {String} [options.token] - allows callback identification by
     *                                   token.
     */
    subscribe : function(name, callback, options) {
      options = options || {};
      this._events = this._events || {};
      this._events[name] = this._events[name] || [];

      var subscription = {
        callback : callback,
        priority : options.priority || 0,
        token : options.token || _.uniqueId("t"),
        context : options.context || this
      };
      var position;
      _.each(this._events[name], function(event, index) {
        if (!_.isUndefined(position)) { return; }
        if (event.priority <= subscription.priority) {
          position = index;
        }
      });

      this._events[name].splice(position, 0, subscription);
      return subscription.token;
    },

    /**
     * Allows subscribing to an event once. When the event is triggered this
     * subscription will be removed.
     *
     * @param {String} name - name of event
     * @param {Function}  callback - The callback to trigger
     */
    subscribeOnce : function(name, callback) {
      this._events = this._events || {};
      var token = _.uniqueId("t");
      return this.subscribe(name, function() {
        this.unsubscribe(name, { token : token });
        callback.apply(this, arguments);
      }, this, token);
    },

    /**
     * Allows unsubscribing from a specific event
     *
     * @param {String} name - event to unsubscribe from
     * @param {Function|String} identifier - callback to remove OR token.
     */
    unsubscribe : function(name, identifier) {

      if (_.isUndefined(this._events[name])) { return this; }

      if (_.isFunction(identifier)) {
        this._events[name] = _.reject(this._events[name], function(b) {
          return b.callback === identifier;
        });

      } else if ( _.isString(identifier)) {
        this._events[name] = _.reject(this._events[name], function(b) {
          return b.token === identifier;
        });

      } else {
        this._events[name] = [];
      }
      return this;
    }

  };

}(this, _));
