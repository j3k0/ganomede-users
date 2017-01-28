# Handles facebook login/registration process for
# the stormpath backend

stateMachine = require "state-machine"
restify = require 'restify'
statsWrapper = require '../statsd-wrapper'
defaultLog = require '../log'

createClient = ({
  client, application, aliasesClient, facebookFriends,
  fullnamesClient, facebookClient, authenticator,
  friendsClient, stats,
  log = defaultLog, checkBan
}) ->
  stats = stats || statsWrapper.createClient log

  # Login (or register) a facebook user account
  login: (body, cb) ->

    fbProcess = stateMachine()

    # Get / create user account
    getAccount = ->
      account =
        providerData:
          providerId: "facebook"
          accessToken: body.accessToken
      stats.increment 'stormpath.application.account.get'
      application.getAccount account, (err, result) ->
        if err
          fbProcess.stormpathError = err
          fbProcess.fail()
        else
          fbProcess.accountResult = result
          fbProcess.next()

    # Analyse the account
    handleAccount = ->
      result = fbProcess.accountResult
      log.info "logged in:", result
      if result.account.status == "ENABLED"
        if result.created
          if body.username && body.password
            fbProcess.create()
          else
            fbProcess.metaErr =
              new restify.BadRequestError("username or password not provided")
            fbProcess.delete()
        else
          fbProcess.login()
      else
        fbProcess.fail()

    # Delete the account
    deleteFacebookAccount = ->
      result = fbProcess.accountResult
      stats.increment 'stormpath.client.account.get'
      client.getAccount result.account.href, (err, account) ->
        if err
          # Only fail, account is deleted because of an error already
          fbProcess.fail()
        else
          stats.increment 'stormpath.account.delete'
          account.delete (err) ->
            if err
              fbProcess.fail()
            else
              fbProcess.next()

    # Delete the account
    deleteCoAccount = ->
      stats.increment 'stormpath.client.account.get'
      client.getAccount fbProcess.coAccount.href, (err, account) ->
        if err
          # Only fail, don't store error.
          # account is deleted because of an error already
          log.error err
          fbProcess.fail()
        else
          stats.increment 'stormpath.account.delete'
          account.delete (err) ->
            if err
              log.error err
              fbProcess.fail()
            else
              fbProcess.next()

    # Retrieve account alias
    getAlias = ->
      result = fbProcess.accountResult
      aliasesClient.get result.account.username,
      (err, value) ->
        if err
          fbProcess.error = err
          fbProcess.fail()
        else if !value
          fbProcess.empty()
        else
          body.username = value
          if !fbProcess.coAccount
            fbProcess.coAccount =
              username: value
          fbProcess.next()

    # Save the account alias
    saveAlias = ->
      # Store alias stormpath username -> co-account username
      # in usermeta (someone@fovea.cc -> jeko)
      result = fbProcess.accountResult
      aliasesClient.set result.account.username, body.username,
      (err, reply) ->
        if err
          fbProcess.error = err
          fbProcess.fail()
        else
          fbProcess.next()

    # Save the link facebookId => username
    saveFacebookId = ->
      aliasesClient.set "fb:#{body.facebookId}", body.username,
      (err, reply) ->
        if err
          fbProcess.error = err
          fbProcess.fail()
        else
          fbProcess.next()

    # Save the accounts fullname
    saveFullName = ->
      fbProcess.next()
      result = fbProcess.accountResult
      username = body.username
      fullname = result.account.fullName
      log.info "storing fullname",
        username: username
        fullname: fullname
      if username and fullname
        fullnamesClient.set username, fullname, (err, reply) ->
          if err
            log.warn "failed to store fullname", err,
              username: username
              fullname: fullname

    # Create a co-account associated with the facebook account
    createCoAccount = ->
      result = fbProcess.accountResult

      # Check that required body parameters are available
      [ "facebookId", "username", "password" ].forEach (fieldName) ->
        if not body[fieldName]
          fbProcess.error = new restify.BadRequestError(
            "missing field: #{fieldName}")
      if fbProcess.error
        fbProcess.fail()
        return

      account =
        username:   body.username
        password:   body.password
        givenName: "Facebook"
        middleName: body.facebookId
        surname:    result.account.username
        email:      result.account.email

      log.info "register",
        coAccount: account
        account: result.account

      stats.increment 'stormpath.application.account.create'
      application.createAccount account, (err, account) ->
        if err
          if err.code == 2001
            # account already exists. link it with the facebook account
            fbProcess.link()
          else
            fbProcess.stormpathError = err
            fbProcess.fail()
        else
          fbProcess.coAccount = account
          fbProcess.next()

    # Load
    loadCoAccount = ->
      result = fbProcess.accountResult
      fbProcess.coAccount =
        username:   body.username
        email:      result.account.email
      fbProcess.next()

    # Only reply to not banned users
    checkBanState = ->
      username = body.username
      checkBan username, (err, exists) ->
        if (err)
          fbProcess.error = err
          return fbProcess.fail()

        if (exists)
          fbProcess.statusError = 403
          return fbProcess.fail()

        fbProcess.next()

    # Create and send the auth token
    sendToken = ->
      result = fbProcess.accountResult
      coAuth = authenticator.add
        facebookToken: body.accessToken
        username: fbProcess.coAccount.username
        email: fbProcess.coAccount.email || result.account.email
      cb null, authenticator.add
        facebookToken: body.accessToken
        username: body.username
        email: result.account.email
        token: coAuth.token
      fbProcess.next()

    # Store the list of facebook friends
    storeFriends = ->

      # Let's retrieve friends asynchronously, no need to delay login
      fbProcess.next()

      # Get friends from facebook
      facebookFriends.storeFriends
        aliasesClient: aliasesClient
        friendsClient: friendsClient
        facebookClient: facebookClient
        username: body.username
        accessToken: body.accessToken
        callback: (err, usernames) ->
          if err
            log.error "Failed to store friends", err
          else
            log.info "Friends stored", usernames

    reportFailure = ->
      if fbProcess.stormpathError
        cb fbProcess.stormpathError
      else if fbProcess.error
        cb fbProcess.error
      else if fbProcess.statusError
        cb null, fbProcess.statusError
      else
        cb null, token: null

    fbProcess.build()
      .state 'start', initial: true
      .state 'getAccount', enter: getAccount
      .state 'handleAccount', enter: handleAccount
      .state 'getAlias', enter: getAlias
      .state 'createCoAccount', enter: createCoAccount
      .state 'loadCoAccount', enter: loadCoAccount
      .state 'deleteFacebookAccount', enter: deleteFacebookAccount
      .state 'saveAlias', enter: saveAlias
      .state 'saveFacebookId', enter: saveFacebookId
      .state 'saveFullName', enter: saveFullName
      .state 'deleteCoAccount', enter: deleteCoAccount
      .state 'reportFailure', enter: reportFailure
      .state 'checkBanState', enter: checkBanState
      .state 'sendToken', enter: sendToken
      .state 'storeFriends', enter: storeFriends
      .state 'done', enter: (-> cb()) # next with no arguments

      .event 'start', 'start', 'getAccount'

      # After getAccount we handle the account
      .event 'next', 'getAccount', 'handleAccount'
      .event 'fail',   'getAccount', 'reportFailure'

      # After handleAccount, either create an account or login
      .event 'create', 'handleAccount', 'createCoAccount'
      .event 'login', 'handleAccount', 'getAlias'
      .event 'delete', 'handleAccount', 'deleteFacebookAccount'
      .event 'fail', 'handleAccount', 'reportFailure'

      # After retrieving an alias, send auth token
      .event 'next', 'getAlias', 'saveFacebookId'
      .event 'fail', 'getAlias', 'reportFailure'
      .event 'empty', 'getAlias', 'createCoAccount'

      # After creating an account, save the alias
      # In case of failure, delete the account
      # If it already exists, link it with facebook
      .event 'next', 'createCoAccount', 'saveAlias'
      .event 'fail', 'createCoAccount', 'deleteFacebookAccount'
      .event 'link', 'createCoAccount', 'loadCoAccount'

      # If loading the coaccount succeeded, save the alias
      # In case of failed, delete the facebook account
      .event 'next', 'loadCoAccount', 'saveAlias'
      .event 'fail', 'loadCoAccount', 'deleteFacebookAccount'

      # After deleting the facebook account, report the failure in any case
      .event 'next', 'deleteFacebookAccount', 'reportFailure'
      .event 'fail', 'deleteFacebookAccount', 'reportFailure'

      # After saving the alias, save the facebookId
      .event 'next', 'saveAlias', 'saveFacebookId'
      .event 'fail', 'saveAlias', 'deleteCoAccount'

      # After saving the facebookId, save the full name
      .event 'next', 'saveFacebookId', 'saveFullName'
      .event 'fail', 'saveFacebookId', 'deleteCoAccount'

      # After saving the fullname, check whether username is banned…
      #   - if so, reply with 403;
      #   - send auth token otherwise.
      .event 'next', 'saveFullName', 'checkBanState'
      .event 'fail', 'saveFullName', 'deleteCoAccount'

      .event 'next', 'checkBanState', 'sendToken'
      .event 'fail', 'checkBanState', 'reportFailure'

      # After deleting the facebook account, report the failure in any case
      .event 'next', 'deleteCoAccount', 'deleteFacebookAccount'
      .event 'fail', 'deleteCoAccount', 'deleteFacebookAccount'

      # After sending the token, store friends
      .event 'next', 'sendToken', 'storeFriends'

      # After storing friends, we're done
      .event 'next', 'storeFriends', 'done'

    fbProcess.onChange = (currentStateName, previousStateName) ->
      log.info "#{previousStateName} -> #{currentStateName}"
    fbProcess.start()

module.exports =
  createClient: createClient

# vim: ts=2:sw=2:et:
