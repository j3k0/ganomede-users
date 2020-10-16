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
//    import deferredEvents from './deferredEvents'
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

import { Request, Response, RequestHandler, Next } from "restify";
import { EventSender, EventData, EventSenderCallback } from "./event-sender";

interface DeferredEvent {
  channel: string;
  type: string;
  data: EventData;
}

let allEvents: { [req_id: string]: DeferredEvent[] } = {};

export interface DeferredEvents {
  sendEvent(channel: string, type: string, data: EventData, callback?: EventSenderCallback);
  editEvent(req_id: string | null | undefined, channel: string, type: string, key: string, value: any);
  finalize(sender: EventSender): RequestHandler;
  reset();
};

export default {

  sendEvent(channel: string, type: string, data: EventData, callback?: EventSenderCallback) {
    const req_id: string | null | undefined = data.req_id;
    if (req_id) {
      const events = (allEvents[req_id] = allEvents[req_id] || []);
      events.push({channel, type, data});
    }
    if (callback) {
      return callback(null, {});
    }
  },

  editEvent(req_id: string | null | undefined, channel: string, type: string, key: string, value: any) {
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

  finalize(sender: EventSender): RequestHandler {
    return function (req: Request, _res: Response, _next?: Next) {
      if (allEvents[req.id()]) {
        const events = allEvents[req.id()] || [];
        events.forEach(({ channel, type, data }) => sender(channel, type, data));
        return delete allEvents[req.id()];
      }
    };
  },

  reset() { return allEvents = {}; }
};

