Users' API
----------

# User accounts

User accounts API is fully inspired by Stormpath.

See http://docs.stormpath.com/rest/product-guide/#application-accounts when in doubt about a parameter.

## Configuration

 * `STORMPATH_API_ID`
 * `STORMPATH_API_SECRET`
 * `STORMPATH_APP_NAME`
 * `REDIS_AUTH_PORT_6379_TCP_ADDR`
 * `REDIS_AUTH_PORT_6379_TCP_PORT`
 * `REDIS_USERMETA_PORT_6379_TCP_ADDR`
 * `REDIS_USERMETA_PORT_6379_TCP_PORT`
 * `FACEBOOK_APP_SECRET`

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
        "facebookAccessToken": "AccessTokenFromFacebook",
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
        "facebookAccessToken": "AccessTokenFromFacebook"
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

