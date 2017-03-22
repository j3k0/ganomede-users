assert = require "assert"
deferredEvents = require '../src/deferred-events'
td = require 'testdouble'
_ = require 'lodash'

describe "deferred-events", ->

  beforeEach ->
    deferredEvents.reset()

  REQ_ID = "test-request"
  TYPE = "test-type"
  DATA = {a:1, b:2, c: {d:3}, req_id: REQ_ID}

  describe ".sendEvent(type, data, callback)", ->
    it "should put sent event aside", (done) ->
      deferredEvents.sendEvent TYPE, DATA, ->
        done()

  describe ".finalize(sender)", ->
    it "should return a (req, res) function", ->
      assert.equal "function", typeof deferredEvents.finalize(null)
      assert.equal 2, deferredEvents.finalize(null).length

  describe ".finalize(sender)(req, res)", ->
    it "should send pending events", (done) ->
      sender = td.function 'sender'
      deferredEvents.sendEvent TYPE, DATA, ->
        deferredEvents.finalize(sender)({id: -> REQ_ID}, null)
        td.verify sender TYPE, DATA
        done()

  describe ".editEvent(req_id, type, key, value)", ->
    it "should modify pending events", (done) ->
      sender = td.function 'sender'
      deferredEvents.sendEvent TYPE, DATA, ->
        deferredEvents.editEvent REQ_ID, TYPE, "edited", "new-value"
        deferredEvents.finalize(sender)({id: -> REQ_ID}, null)
        editedData = _.extend {}, DATA, {edited: "new-value"}
        td.verify sender TYPE, editedData
        done()


# vim: ts=2:sw=2:et:

