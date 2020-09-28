/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//
// The directory client can trigger events, but we'd like to sometimes
// extend them with our own data.
//
// My idea was to create a sendEvent function that just stores the event(s)
// to be sent in a array (in the `req` object), then add a `after` restify
// extension that do the sending of the event.
//
// Any request that needs to extend a specific event with more data can do so
// by using the `editEvent` method, that change existing events instead of
// adding a new one. `editEvent` extends the event data (not replacing existing)
//
// Usage:
// ------
//
//    var deferredEvents = require('./deferredEvents')
//
// from your middlewares:
//
//    deferredEvents.sendEvent type, {req_id, more_data...}
//    deferredEvents.editEvent type, {metadata: {a:1, b:2}}
//
// at server creation:
//
//    server.on('after', deferredEvents.finalize(sender))
//
// (where sender is the actual event sender function (see event-sender.coffee)
//

let allEvents = {};

export default {

  sendEvent(type, data, callback) {
    const {
      req_id
    } = data;
    if (req_id) {
      const events = (allEvents[req_id] = allEvents[req_id] || []);
      events.push({type, data});
    }
    if (callback) {
      return callback(null, {});
    }
  },

  editEvent(req_id, type, key, value) {
    if (req_id) {
      const events = allEvents[req_id] || [];
      return events.forEach(function(event) {
        if (type === event.type) {
          if (!event.data) {
            event.data = {};
          }
          if (!event.data[key]) {
            return event.data[key] = value;
          }
        }
      });
    }
  },

  finalize(sender) { return function(req, res) {
    if (allEvents[req.id()]) {
      const events = allEvents[req.id()] || [];
      events.forEach(({type, data}) => sender(type, data));
      return delete allEvents[req.id()];
    }
  }; },

  reset() { return allEvents = {}; }
};

