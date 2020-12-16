/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import deferredEvents from '../src/deferred-events';
import td from 'testdouble';
import _ from 'lodash';
import { EventSender } from "../src/event-sender";
import { Request, Response, Next } from "restify";

describe("deferred-events", function() {

  beforeEach(() => deferredEvents.reset());

  const CHANNEL = "test-channel";
  const REQ_ID = "test-request";
  const TYPE = "test-type";
  const DATA = {a:1, b:2, c: {d:3}, req_id: REQ_ID};

  describe(".sendEvent(type, data, callback)", function () {
    it("should put sent event aside", function(done) {
      deferredEvents.sendEvent(CHANNEL, TYPE, DATA, () => done());
    });
  });

  describe(".finalize(sender)", function () {
    it("should return a (req, res, next) function", function () {
      assert.equal("function", typeof deferredEvents.finalize(null as unknown as EventSender));
      assert.equal(3, deferredEvents.finalize(null as unknown as EventSender).length);
    });
  });

  describe(".finalize(sender)(req, res)", () => it("should send pending events", function(done) {
    const sender = td.function('sender') as EventSender;
    return deferredEvents.sendEvent(CHANNEL, TYPE, DATA, function() {
      deferredEvents.finalize(sender)({
        id() {
          return REQ_ID;
        }
      } as unknown as Request, null as unknown as Response, null as unknown as Next);
      td.verify(sender(CHANNEL, TYPE, DATA));
      return done();
    });
  }));

  return describe(".editEvent(req_id, type, key, value)", () => it("should modify pending events", function(done) {
    const sender = td.function('sender') as EventSender;
    return deferredEvents.sendEvent(CHANNEL, TYPE, DATA, function() {
      deferredEvents.editEvent(REQ_ID, CHANNEL, TYPE, "edited", "new-value");
      deferredEvents.finalize(sender)({
        id() { return REQ_ID; }
      } as unknown as Request, null as unknown as Response, null as unknown as Next);
      const editedData = _.extend({}, DATA, {edited: "new-value"});
      td.verify(sender(CHANNEL, TYPE, editedData));
      return done();
    });
  }));
});


// vim: ts=2:sw=2:et:

