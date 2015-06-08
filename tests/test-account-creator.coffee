assert = require "assert"

fakeBunyanLogger =
  child: ->
    info: ->

describe 'account-creator', ->
  AccountCreator = require "../src/account-creator"

  it 'should report an error on failure', (done) ->
    creator = new AccountCreator
      application:
        createAccount: (account, cb) -> cb "ERROR"
      log: fakeBunyanLogger
    creator.create {}, (err, data) ->
      assert.ok err
      done()

  it 'should send a null token to disabled accounts', (done) ->
    creator = new AccountCreator
      application:
        createAccount: (account, cb) -> cb null, { status: "DISABLED" }
      log: fakeBunyanLogger
    creator.create {}, (err, data) ->
      assert.ok !err
      assert.equal null, data.token
      done()

  it 'should login valid accounts', (done) ->
    creator = new AccountCreator
      application:
        createAccount: (account, cb) ->
          cb null,
            username: account.username
            status: "ENABLED"
      log: fakeBunyanLogger
      loginAccount: (account, callback) ->
        assert.equal "jeko", account.username
        callback null, { token: "1234" }

    creator.create { username: "jeko" }, (err, data) ->
      assert.ok !err
      assert.equal "1234", data.token
      done()

# vim: ts=2:sw=2:et:
