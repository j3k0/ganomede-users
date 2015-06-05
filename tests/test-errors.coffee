assert = require "assert"
errors = require "../src/errors"

describe "errors", ->

  it "Should declare TooLongError", ->
    assert.ok errors.TooLongError
    assert.ok new errors.TooLongError "provided arg was too long"

  it "Should declare TooShortError", ->
    assert.ok errors.TooShortError
    assert.ok new errors.TooShortError "provided arg was too short"

  it "Should declare BadUsernameError", ->
    assert.ok errors.BadUsernameError
    assert.ok new errors.BadUsernameError "provided username is bad"

# vim: ts=2:sw=2:et:

