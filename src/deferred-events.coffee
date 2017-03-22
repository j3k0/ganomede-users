#
# The directory client can trigger events, but we'd like to sometimes
# extend them with our own data.
#
# My idea was to create a sendEvent function that just stores the event(s)
# to be sent in a array (in the `req` object), then add a `after` restify
# extension that do the sending of the event.
#
# Any request that needs to extend a specific event with more data can do so
# by using the `editEvent` method, that change existing events instead of
# adding a new one. `editEvent` extends the event data (not replacing existing)
#
# Usage:
# ------
#
#    var deferredEvents = require('./deferredEvents')
#
# from your middlewares:
#
#    deferredEvents.sendEvent type, {req_id, more_data...}
#    deferredEvents.editEvent type, {metadata: {a:1, b:2}}
#
# at server creation:
#
#    server.on('after', deferredEvents.finalize(sender))
#
# (where sender is the actual event sender function (see event-sender.coffee)
#

allEvents = {}

module.exports =

  sendEvent: (type, data, callback) ->
    req_id = data.req_id
    if req_id
      events = allEvents[req_id] = allEvents[req_id] || []
      events.push({type, data})
    if callback
      callback null, {}

  editEvent: (req_id, type, key, value) ->
    if req_id
      events = allEvents[req_id] || []
      events.forEach (event) ->
        if type == event.type
          if !event.data
            event.data = {}
          if !event.data[key]
            event.data[key] = value

  finalize: (sender) -> (req, res) ->
    if allEvents[req.id()]
      events = allEvents[req.id()] || []
      events.forEach ({type, data}) ->
        sender type, data
      delete allEvents[req.id()]

  reset: () -> allEvents = {}

