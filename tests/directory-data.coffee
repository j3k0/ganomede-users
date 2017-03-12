_ = require 'lodash'
tagizer = require 'ganomede-tagizer'
picker = (fields) -> (obj) -> _.pick obj, fields

that = module.exports = {

APP_ID: "cc.fovea.test"

credentials:   picker [ 'username', 'password' ]
publicAccount: picker [ 'username', 'email' ]
authResult:    picker [ 'token' ]
account:       picker [ 'username', 'email', 'password' ]
authAccount:   picker [ 'username', 'email', 'token' ]
facebookAccount: picker [
  'username', 'password', 'facebookId', 'accessToken' ]
directoryAccount: picker [ 'id', 'password' ]
directoryAliases: (account) ->
  ret = []
  if account.facebook_id
    ret.push
      type: "facebook.id.#{that.APP_ID}"
      value: account.facebook_id
      public: false
  if account.email
    ret.push
      type: "email"
      value: account.email
      public: false
  if account.username
    ret.push
      type: "name"
      value: account.username
      public: true
    ret.push
      type: "tag"
      value: tagizer.tag(account.username)
      public: true
  ret
findAlias: (type, account) ->
  that.directoryAliases(account).filter((a) -> a.type == type)[0]
directoryAliasesObj: (account) ->
  that.directoryAliases(account).reduce((acc, obj) ->
    if obj.public
      acc[obj.type] = obj.value
    acc
  , {})
facebookLogin: (account) ->
  accessToken: account.facebook_access_token
  username: account.username
  password: account.password

API_SECRET: 'my-very-secret'

EXISTING_USER:
  id: 'ex1sTING'
  username: 'ex1sTING'
  email: 'user@email.com'
  password: '123456'
  token: 'auth-token'
  facebook_id: '1000'
  facebook_access_token: 'access-token'
  fullName: "Existing User"

SECONDARY_USER:
  id: 's3cdary'
  username: 's3cdary'
  email: 'other@email.com'
  password: '654321'
  token: 'token-auth'
  facebook_id: '2000'
  facebook_access_token: 'secondary-access-token'
  fullName: "Secondary User"

NEW_USER:
  id: '1newUser'
  username: '1newUser'
  password: '12345678'
  email: 'newuser@email.com'
  token: 'token-auth-new'
  facebook_id: '3000'
  facebook_access_token: 'new-access-token'
  fullName: "New User"
}
# vim: ts=2:sw=2:et:
