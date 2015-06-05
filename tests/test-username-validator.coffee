assert = require "assert"

describe 'username-validator', ->
  usernameValidator = require "../src/username-validator"

  it 'should allow valid usernames', ->
    err = usernameValidator '01aAbBzZ9'
    assert.ok !err

  it 'should not allow long username', ->
    assert.ok !usernameValidator '0123456789'
    err = usernameValidator '01234567890'
    assert.ok err?.name == 'TooLongError'

  it 'should not allow short username', ->
    assert.ok !usernameValidator '012'
    err = usernameValidator '01'
    assert.ok err?.name == 'TooShortError'

  it 'should not allow special characters', ->
    err = usernameValidator '0000@'
    assert.ok err?.name == 'BadUsernameError'

    assert.ok usernameValidator '0000@'
    assert.ok usernameValidator '_0000'
    assert.ok usernameValidator '00-00'
    assert.ok usernameValidator '0/000'
    assert.ok usernameValidator '000é0'
    assert.ok usernameValidator ' 0000'
    assert.ok usernameValidator '0000 '

# vim: ts=2:sw=2:et:
