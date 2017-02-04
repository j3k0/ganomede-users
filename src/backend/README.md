# Backend API

This is the API that backends have to comply to.

### createBackend(options)

The backend modules export an object with a `createBackend()` function.

 * `options` is a `BackendOptions` object
 * **returns** a `BackendInitializer` object

### Type BackendOptions

an object with the following fields:

 * `authenticator`
   * see `src/authentication.coffee`
 * `aliasesClient`
   * see `src/aliases.coffee`
 * `fullnamesClient`
   * see `src/fullnames.coffee`
 * `facebookClient`
   * see `src/facebook.coffee`
 * `checkBan`
   * a function that checks the ban status of a user
   * signature: `checkban(callback)`
   * callback's signature: `callback(err, banned)`
   * user is banned when `banned` is true.

### Type BackendInitializer

An object with a `initialize` method.

### BackendInitializer.initialize(callback)

Initializes the backend. Callback has the following signature: `callback(err, backend)`

 * `err` is an Error or null
 * `backend` is a `Backend` object (if err is null)

### Type Backend

 * `loginFacebook`: Function
 * `loginAccount`: Function
 * `createAccount`: Function
 * `sendPasswordResetEmail`: Function

Those methods are documented below.

### Backend.loginFacebook(account, callback)

Logins or register a user with facebook.

 * `account` is a `FacebookAccount` object
 * `callback` has the following signature: `callback(Error, AuthResult)`

When the user logs in for the first time, it'll get registered in the backend with FacebookAccount's provided `username` and `password`, and data fetched from facebook's graph API.

When the user already exists, `username` and `password` are disregarded.

### Type FacebookAccount

 * `facebookId`: String
    * the facebook id of the user
 * `accessToken`: String
    * the facebook access token
 * `username`: String
    * the backend username
 * `password`: String
    * the backend password

### Type AuthResult

 * `token` an authdb authentication token

### Backend.loginAccount(credentials, callback)

Attempts to login the user with the provided credentials.

 * `credentials` is a `Credentials` object
 * `callback` has the following signature: `callback(Error, AuthResult)`

### Type Credentials

 * `username`: String
 * `password`: String

### backend.createAccount(account, callback)

Registers and authenticates an user.

 * `account` is a `Account` object
 * `callback` has the following signature: `callback(Error, AuthResult)`

### Type Account

 * `username` - desired username
 * `email` - users' email
 * `password` - plain text password

### backend.sendPasswordResetEmail(email, callback)

Sends an email with instructions to change the password (or a new password).

 * `email` - which user want to recover a new password.
 * `callback` has the following signature: `callback(Error)`

### Type Error

```coffee
restify.RestError
  restCode: "EmailNotFoundError"
  statusCode: err.status
```

```coffee
restify.RestError
  restCode: "EmailBadFormatError"
  statusCode: err.status
```

```coffee
restify.RestError
  restCode: "EmailBadFormatError"
  statusCode: err.status
```

```coffee
errorCode = (err) -> err.code || "Unknown"
statusCode = (err) ->
  if err.code == 7100 then 401 else err.status

new restify.RestError
  restCode: "Stormpath" + err.name + errorCode(err.code)
  statusCode: statusCode(err)
```
