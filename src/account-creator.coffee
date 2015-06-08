
class AccountCreator

  constructor: (options) ->
    @application = options.application
    @log = options.log.child { module: 'AccountCreator' }
    @loginAccount = options.loginAccount

  create: (account, callback) ->
    @log.info "register", account
    @application.createAccount account, (err, createdAccount) =>
      if err
        return callback err
      if createdAccount.status != "ENABLED"
        return callback null,
          token: null
      @log.info "registered", createdAccount
      @loginAccount account, callback

module.exports = AccountCreator

# vim: ts=2:sw=2:et:
