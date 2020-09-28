/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import deferredEvents from '../src/deferred-events';
import td from 'testdouble';
import _ from 'lodash';

describe("deferred-events", function() {

  beforeEach(() => deferredEvents.reset());

  const REQ_ID = "test-request";
  const TYPE = "test-type";
  const DATA = {a:1, b:2, c: {d:3}, req_id: REQ_ID};

  describe(".sendEvent(type, data, callback)", () => it("should put sent event aside", done => deferredEvents.sendEvent(TYPE, DATA, () => done())));

  describe(".finalize(sender)", () => it("should return a (req, res) function", function() {
    assert.equal("function", typeof deferredEvents.finalize(null));
    return assert.equal(2, deferredEvents.finalize(null).length);
  }));

  describe(".finalize(sender)(req, res)", () => it("should send pending events", function(done) {
    const sender = td.function('sender');
    return deferredEvents.sendEvent(TYPE, DATA, function() {
      deferredEvents.finalize(sender)({id() { return REQ_ID; }}, null);
      td.verify(sender(TYPE, DATA));
      return done();
    });
  }));

  return describe(".editEvent(req_id, type, key, value)", () => it("should modify pending events", function(done) {
    const sender = td.function('sender');
    return deferredEvents.sendEvent(TYPE, DATA, function() {
      deferredEvents.editEvent(REQ_ID, TYPE, "edited", "new-value");
      deferredEvents.finalize(sender)({id() { return REQ_ID; }}, null);
      const editedData = _.extend({}, DATA, {edited: "new-value"});
      td.verify(sender(TYPE, editedData));
      return done();
    });
  }));
});


// vim: ts=2:sw=2:et:

