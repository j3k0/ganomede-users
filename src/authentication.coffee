# Generate a random token
rand = -> Math.random().toString(36).substr(2)
defaultGenToken = -> rand() + rand()
defaultTimestamp = -> "" + (new Date().getTime())

createAuthenticator = ({
  authdbClient
  localUsermetaClient
  centralUsermetaClient
  genToken = defaultGenToken
  timestamp = defaultTimestamp
}) ->

  updateAuthMetadata: (account) ->
    t = timestamp()
    localUsermetaClient.set account.username, "auth", t, (err, reply) ->
    centralUsermetaClient.set account.username, "auth", t, (err, reply) ->

  getAuthMetadata: (account, cb) ->
    centralUsermetaClient.get account.username, "auth", cb

  # Add authentication token in authDB, save 'auth' metadata.
  add: (account) ->

    # Generate and save the token
    token = account.token || genToken()
    authdbClient.addAccount token,
      username: account.username
      email: account.email

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
