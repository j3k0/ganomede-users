# Generate a random token
rand = -> Math.random().toString(36).substr(2)
defaultGenToken = -> rand() + rand()
defaultTimestamp = -> "" + (new Date().getTime())
log = require './log'

createAuthenticator = ({
  authdbClient
  localUsermetaClient
  centralUsermetaClient
  genToken = defaultGenToken
  timestamp = defaultTimestamp
  apiSecret = process.env.API_SECRET
}) ->

  updateAuthMetadata: (account) ->
    t = timestamp()
    params =
      req_id:    account.req_id
      username:  account.username
      apiSecret: apiSecret
    localUsermetaClient.set params, "auth", t, (err, reply) ->
    centralUsermetaClient.set params, "auth", t, (err, reply) ->

  getAuthMetadata: (account, cb) ->
    centralUsermetaClient.get account.username, "auth", cb

  # Add authentication token in authDB, save 'auth' metadata.
  add: (account) ->

    # Generate and save the token
    token = account.token || genToken()
    authdbClient.addAccount token,
      username: account.username
      email: account.email
    , (err) ->
      if err
        log.warn {err}, "authdbClient.addAccount failed"

    # Store the auth date (in parallel, ignoring the outcome)
    @updateAuthMetadata account

    # Return REST-ready authentication data
    {
      username: account.username
      email: account.email
      token: token
    }

module.exports = {
  createAuthenticator
}

# vim: ts=2:sw=2:et:
