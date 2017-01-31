_ = require 'lodash'
picker = (fields) -> (obj) -> _.pick obj, fields

that = module.exports = {

credentials:   picker [ 'username', 'password' ]
publicAccount: picker [ 'username', 'email' ]
authResult:    picker [ 'token' ]
account:       picker [ 'username', 'email', 'password' ]
authAccount:   picker [ 'username', 'email', 'token' ]
facebookAccount: picker [
  'username', 'password', 'facebookId', 'accessToken' ]
directoryAccount: picker [ 'id', 'password' ]

API_SECRET: 'my-very-secret'

EXISTING_USER:
  id: 'ex1sTING'
  username: 'ex1sTING'
  email: 'user@email.com'
  password: '123456'
  token: 'auth-token'
  facebook_id: '6777'
  facebook_access_token: 'access-token'

SECONDARY_USER:
  id: 's3cdary'
  username: 's3cdary'
  email: 'other@email.com'
  password: '654321'
  token: 'token-auth'

NEW_USER:
  id: '1newUser'
  username: '1newUser'
  password: '123456'
  email: 'newuser@email.com'
}
# vim: ts=2:sw=2:et:
