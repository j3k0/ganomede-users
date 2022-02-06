Users
-----

Users accounts API initially inspired by Stormpath.

See http://docs.stormpath.com/rest/product-guide/#application-accounts when in doubt about a parameter.

Historical notes
----------------

All users data used to be stored in Stormpath a while back. With Stormpath rolling out after being acquired, we migrated our user accounts to ganomede-directory (our own solution). During the migration period, there were users in both user directories, the server includes some logic to make this possible.

With the stormpath API being discontinued, we removed the code that makes use of it. As a side effect, the server still allows multiple user accounts backends to be used, but effectively it only supports a single one: ganomede-directory.

Configuration
-------------

Link with the ganomede-directory service:
 * `DIRECTORY_PORT_8000_TCP_[ADDR|PORT|PROTOCOL]` - IP|port|protocol of the directory service

Link with a central and local usermeta services. Note that *central* metadata are shared across multiple apps, while *local* metadata are only used by this game server.
 * `CENTRAL_USERMETA_PORT_8000_TCP_[ADDR|PORT|PROTOCOL]` - IP|port|protocol of the central usermeta service
 * `LOCAL_USERMETA_PORT_8000_TCP_[ADDR|PORT|PROTOCOL]` - IP|port|protocol of the local usermeta service

Link with the events service, used to send notification when a user logs in, registers a new account, changes their profile or block another user.
 * `EVENTS_PORT_8000_TCP_[ADDR|PORT|PROTOCOL]` - IP|port|protocol of the events service

Link with the facebook API.
 * `FACEBOOK_APP_ID` - Id of the Facebook application
 * `FACEBOOK_APP_SECRET` - Secret of the Facebook application

Link with apple (for Sign In with Apple).
 * `IOS_BUNDLE_ID` - The bundle identifier of the ios application.

Config:
 * `LEGACY_ERROR_CODES` - Use stormpath compatible error codes.
 * `LOG_LEVEL` - See [bunyan levels](https://github.com/trentm/node-bunyan#levels) (default: info)
 * `AUDIT_REQUESTS` - Set to `force` to audit all requests.

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
 * `NO_EMAIL_DOMAIN` - fake domain to use for users without an email address (default "email-not-provided.local")
 * `GUEST_EMAIL_DOMAIN` - domain used for guest users email address (default none)

Statsd options (used for monitoring).

 * `STATSD_HOST` - host that runs the statsd server
 * `STATSD_PORT` - port to connect to statsd server
 * `STATSD_PREFIX` - prefix for data stored in stats (default to `ganomede.users.`)


API
---

## /users/v1/accounts [POST]

### body (application/json)

```json
{
    "username": "tk421",
    "email": "tk421@stormpath.com",
    "password": "Changeme1",
    "metadata": {
        "newsletter": "false",
        "location": "Dublin, Ireland",
        "country": "fr",
        "birth": "1991"
    }
}
```

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
        "username": "tk421"
    }

## /users/v1/login [POST]

Create an authentication token.

### body (application/json)

    {
        "username": "tk421",
        "password": "0000"
    }

Note, tag instead of username also work (this allows mispellings).

### body (application/json)

    {
        "facebookToken": "AccessTokenFromFacebook"
    }

### body (application/json)

    {
        "appleId": "123132.312312.312",
        "appleIdentityToken": "Base64Encoded IdentityToken from Apple",
        "appleAuthorizationCode": "Authorization Code from Apple"
    }

Optionally, you can also include the user `email`, `givenName` and `surname`. An `username` and `password` to use
if the user doesn't exists, so it can be registered automatically.

### response [200] OK

    {
        "token": "0123456789abcdef012345"
    }

`username` will also be included in the response for Facebook and Apple login.

## /users/v1/auth/:token/passwordResetEmail [POST]

### response [202] Accepted

# Metadata

Custom data associated with users.

Additionnally to the custom metadata you can define, ganomede-users also exposes some predefined virtual metadata:

 * `username` - unique and constant identifier for the user
 * `name` - unique display name, that might change
 * `tag` - tagized(name), see the [ganomede tagizer](https://github.com/j3k0/ganomede-tagizer)
 * `email` - (only through `/auth/*` requests)

## /users/v1/auth/:token/metadata/:key [GET]

Users' protected custom data.

### body (application/json)

### response [200] OK

    {
        "key": "some-key",
        "value": "..."
    }

## /users/v1/auth/:token/metadata/:key [POST]

Change users' custom data.

### body (application/json)

    {
        "value": "..."
    }

(limited to 200 bytes)

### response [200] OK

## /users/v1/:tag/metadata/:key [GET]

Users' custom data, retrieved using the users `tag`.

Searching by tag will match any `username`, `name` (or similar looking name) the user ever had.

### body (application/json)

### response [200] OK

    {
        "key": "some-key",
        "value": "..."
    }

# Friends [/users/v1/auth/:authToken/friends]

List of friends

## /users/v1/auth/:authToken/friends [GET]

Retrieve the list of friends

### response [200] OK

    [ "jeko", "sousou", "willy" ]

## /users/v1/auth/:authToken/friends [POST]

Add friends to the list.

### body (application/json)

    {"ok":true}

### response [200] OK

    [ "jeko", "sousou", "willy", "harry", "potter" ]

## /users/v1/auth/:authToken/friends/:id [DELETE]

Remove friends from the list.

### response [200] OK

    {"ok":true}

# Bans `/users/v1/banned-users/`

## Check ban status `/users/v1/banned-users/:tag [GET]`

Returns `BanInfo` object describing account standing of `:tag`.

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
{
  "username": "who-to-ban",
  "apiSecret": "process.env.API_SECRET"
}
```

### response [200]

Ban created successfully.

### response [403]

Invalid or missing API secret.

## Unban user `/users/v1/banned-users/:tag [DELETE]`

### body (application/json)

``` json
{ "apiSecret": "process.env.API_SECRET" }
```

### response [200]

Ban removed successfully or does not exist.

### response [403]

Invalid or missing API secret.


# Blocked users `/users/v1/auth/:token/blocked-users`

A list of blocked users for user identified by the authentication token `:token`.

The list will be stored in the central usermeta, with key `$blocked-users`. The value will be an array of strings containing the usernames of blocked users.

For administration purposes, blocked user will also be stored in a `ganomede-events` channel (`users/v1/blocked-users`). This way, it becomes possible to analyze recently blocked users and generate daily reports.

## Get the list of blocked users `/users/v1/auth/:token/blocked-users [GET]`

Returns the list of blocked users.

### response [200] OK

```js
[ "bob", "marc" ]
```

## Block user `/users/v1/auth/:token/blocked-users [POST]`

Adds a user to the "blocked-users" list.

### body (application/json)

``` json
{ "username": "who-to-block" }
```

### response [200]

Blocked user added successfully, returns the new list of blocked users.

```js
[ "who-to-block", "bob", "marc" ]
```

### response [409]

User already blocked.

### response [403]

Invalid authentication token.

## Unblock user `/users/v1/auth/:token/blocked-users/:tag [DELETE]`

### body (application/json)

Empty.

### response [200]

Blocked user removed successfully or does not exist.

### response [403]

Invalid authentication token.


# Reported Users `/users/v1/auth/:token/reported-users`

## Report user `/users/v1/auth/:token/reported-users [POST]`

Block the user exactly like the `POST blocked-users` endpoint. (cf `/users/v1/auth/:token/blocked-users` endpoint above). However, it adds it to the events stream with type set to `REPORTED` instead of `BLOCKED`.


# Blocked Users Admin `/users/v1/admin/:api-secret/blocked-users`

Endpoint used by administrators to find annoying users.

## List of blocked users `/users/v1/admin/:api-secret/blocked-users` [GET]

## query parameters

You can add a number of filters:

| parameter  | type      | description |
|------------|-----------|-------------|
| `username` | string[]  | comma separated list of users you're interested in      |
| `since`    | timestamp | only return users blocked since the provided timestamp  |

## response [200]

```js
{
    "blocked": [{
        "username": "alice",
        "total": 2,
        "by": [{
            "username": "bob",
            "createdAt": 1476531925454
        }, {
            "username": "marco",
            "createdAt": 1576531925454
        }],
    }, {
        "username": "bob",
        "total": 1,
        "by": [{
            "username": "harry",
            "createdAt": 1376531925454
        }],
    }]
}
```


# Reported users `/users/v1/admin/reported-users` 

A list of the most reported users.

## List reported users `[GET]`

Returns the list of recently reported users.

1. Retrieve a large number of the last events in the "Events" database, channel users/v1/blocked-users.
2. Process this list to count the number of reports per user.
3. Sort descending, only returning users that are not banned.

### query parameters

| parameter  | type      | description |
|------------|-----------|-------------|
| `secret` | string | `API_SECRET`, passed as `?secret=xxxx` |

### response [200] OK

```js
[ 
    { target: 'user1', total: 10 },  
    { target: 'user2', total: 8 } 
]
```


# Blocks and Reports Admin `/users/v1/admin/blocks`

## List of blocks and reports for a given user `/users/v1/admin/blocks/:username` [GET]

`username` is the ID of the user we're interested in.

## query parameters

| parameter  | type      | description |
|------------|-----------|-------------|
| `secret` | string | Passed as `?secret=xxxx` |

## response [200]

```js
{
  "blockedBy": [{
    "username": "bob",
    "on": 1476531925454
  }, {
    "username": "marco",
    "on": 1576531925454
  }],

  "reportedBy": [{
    "username": "harry",
    "on": 1376531925457
  }],

  "reports": [{
    "username": "polo",
    "on": 1526531925451
  }],

  "blocks": [{
    "username": "roger",
    "on": 1546531925452
  }, {
    "username": "albert",
    "on": 1146531925453
  }]
}
```

- `blockedBy`: the `BLOCKED` events targeting this user.
- `reportedBy`: the `REPORTED` events targeting this user.
- `blocks`: the `BLOCKED` events from this user.
- `reports`: the `REPORTED` events from this user.


## Bulk Usermeta /users/v1/auth/:token/multi/metadata/:keys [GET]

Users' protected custom data. `:keys` is a comma separated list of keys to retrieve.

### body (application/json)

### response [200] OK

    [{
        "key": "some-key",
        "value": "..."
    }, {
        "key": "some-other-key",
        "value": "..."
    }]


## Bulk Usermeta /users/v1/multi/metadata/:userIds/:keys [GET]

Retrieve multiple users' custom data, using the users `userId`.

Retrieve publicly available metadata. Both, `:userIds` and `:keys` are comma-separated list. Attach secret query string param to retrieve fields up to internal.

Missing or unknown keys, and those you are not allowed to read will be omitted (as opposed to returning an HTTP error).

### body (application/json)

### response [200] OK

    [{
        "username": "alice",
        "key": "location",
        "value": "..."
    }, {
        "username": "bob",
        "key": "lastseen",
        "value": "..."
    }]

If the key doesn't exist or cannot be accessed, it will be omitted from the result.

---
 