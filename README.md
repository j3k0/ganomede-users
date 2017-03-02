Users
-----

Users accounts API initially inspired by Stormpath.

See http://docs.stormpath.com/rest/product-guide/#application-accounts when in doubt about a parameter.

Configuration
-------------

 * `STORMPATH_API_ID`
 * `STORMPATH_API_SECRET`
 * `STORMPATH_APP_NAME`
 * `DIRECTORY_PORT_8080_TCP_ADDR` - IP of the rules service
 * `DIRECTORY_PORT_8080_TCP_PORT` - Port of the rules service
 * `DIRECTORY_PORT_8080_TCP_PROTOCOL` - Port of the rules service
 * `REDIS_AUTH_PORT_6379_TCP_ADDR` - IP of the AuthDB redis
 * `REDIS_AUTH_PORT_6379_TCP_PORT` - Port of the AuthDB redis
 * `REDIS_USERMETA_PORT_6379_TCP_ADDR` - IP of the usermeta redis
 * `REDIS_USERMETA_PORT_6379_TCP_PORT` - Port of the usermeta redis
 * `FACEBOOK_APP_ID` - Id of the Facebook application
 * `FACEBOOK_APP_SECRET` - Secret of the Facebook application
 * `LEGACY_ERROR_CODES` - Use stormpath compatible error codes
 * `USE_STORMPATH_ONLY` - Only enable the Stormpath backend
 * `USE_DIRECTORY_ONLY` - Only enable the Directory backend
 * `CREATE_USERS_IN_STORMPATH` - New users will use Stormpath backend
 * `LOG_LEVEL` - See [bunyan levels](https://github.com/trentm/node-bunyan#levels) (default: info)

Mailer options (for password reset emails)

 * `MAILER_SEND_FROM` - Sender of password reset email
 * `MAILER_SEND_SUBJECT` - Subject of password reset email
 * `MAILER_SEND_TEXT` - Plain text of password reset email
 * `MAILER_SEND_HTML` - HTML text of password reset email
 * `MAILER_PORT` - the port to connect to (defaults to 25 or 465)
 * `MAILER_HOST` - the hostname or IP address to connect to (defaults to 'localhost')
 * `MAILER_SECURE` - connection should use SSL (if `true`) or not (if `false`)
 * `MAILER_AUTH_USER` - username to use when connecting to smtp server
 * `MAILER_AUTH_PASS` - password to use when connecting to smtp server
 * `MAILER_IGNORE_TLS` - turns off STARTTLS support if true
 * `MAILER_NAME` - optional hostname of the client, used for identifying to the server
 * `MAILER_LOCAL_ADDRESS` - the local interface to bind to for network connections
 * `MAILER_CONNECTION_TIMEOUT` - how many milliseconds to wait for the connection to establish
 * `MAILER_GREETING_TIMEOUT` - how many milliseconds to wait for the greeting after connection is established
 * `MAILER_SOCKET_TIMEOUT` - how many milliseconds of inactivity to allow
 * `MAILER_DEBUG` - set to true, then logs SMTP traffic, otherwise logs only transaction events
 * `MAILER_AUTH_METHOD` - defines preferred authentication method, eg. 'PLAIN'

API
---

## /users/v1/accounts [POST]

### body (application/json)

    {
        username: 'tk421',
        email: 'tk421@stormpath.com',
        password: 'Changeme1'
    }

### response [201]

    {
        token: 'rAnDoM'
    }

### body (application/json)

    {
        "facebookToken": "AccessTokenFromFacebook",
        "username": "tk421"
    }

### response [201]

    {
        "token": "rAnDoM"
    }

## /users/v1/auth/:token/me [GET]

### response [200] OK

    {
        "username": "tk421",
        "email": "tk421@stormpath.com"
    }

## /users/v1/login [POST]

### body (application/json)

    {
        "username": "tk421",
        "password": "0000"
    }

### body (application/json)

    {
        "facebookToken": "AccessTokenFromFacebook"
    }

### response [200] OK

    {
        "token": "0123456789abcdef012345"
    }

## /users/v1/auth/:token/passwordResetEmail [POST]

### response [202] Accepted

## /users/v1/auth/:token/metadata/:key [POST]

Users' custom data. Valid metadata keys can be restricted using the `USERMETA_VALID_KEYS` environment variable. A comma-separated list of keys.

Setting `USERMETA_VALID_KEYS` is recommended to prevent people from using your server as free storage. An additional self imposed limitation is that values can't be above 200 bytes.

### body (application/json)

    {
        "value": "..."
    }

(limited to 200 bytes)

### response [200] OK

## /users/v1/:username/metadata/:key [GET]

Users' custom data.

### body (application/json)

### response [200] OK

    {
        "key": "some-key",
        "value": "..."
    }

# Metadata

## /users/v1/:username/metadata/:id [GET]

## /users/v1/auth/:authToken/metadata/:id [POST]

# Friends [/users/v1/auth/:authToken/friends]

List of friends

## List friends [GET]

### response [200] OK

    [ "jeko", "sousou", "willy" ]

## Add friends [POST]

    [ "harry", "potter" ]

### response [200] OK

    [ "jeko", "sousou", "willy", "harry", "potter" ]


# Bans `/users/v1/banned-users/`

## Check ban status `/users/v1/banned-users/:username [GET]`

Returns `BanInfo` object describing account standing of `:username`.

### response [200] OK

``` js
{ "username": "alice",       // Username
  "exists": true,            // true if banned, false otherwise
  "createdAt": 1476531925454 // timestamp of ban creation, 0 if no ban.
}
```

## Ban user `/users/v1/banned-users/ [POST]`

### body (application/json)

``` json
{ "username": "who-to-ban",
  "apiSecret": "process.env.API_SECRET"
}
```

### response [200]

Ban created successfully.

### response [403]

Invalid or missing API secret.

## Unban user `/users/v1/banned-users/:username [DELETE]`

### body (application/json)

``` json
{ "apiSecret": "process.env.API_SECRET" }
```

### response [200]

Ban removed successfully or does not exist.

### response [403]

Invalid or missing API secret.





