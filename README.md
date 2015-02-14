Users' API
----------

# Metadata

## /users/v1/:id/metadata/:id [GET]

## /users/v1/:id/metadata/:id [POST]

# User accounts

User accounts API is fully inspired by Stormpath.

See http://docs.stormpath.com/rest/product-guide/#application-accounts when in doubt about a parameter.

## /users/v1/accounts [POST]

### body (application/json)

    {
        username: 'tk421',
        givenName: 'Joe',
        surname: 'Stormtrooper',
        email: 'tk421@stormpath.com',
        password: 'Changeme1'
    }

### response [201]

    {
        token: 'rAnDoM'
    }

## /users/auth/:token [GET]

### response [200] OK

    {
        "username": "tk421",
        "givenName": "Joe",
        "surname": "Stormtrooper",
        "email": "tk421@stormpath.com"
    }

## /users/login [POST]

### body (application/json)

    {
        "username": "tk421",
        "password": "0000"
    }

### response [200] OK

    {
        "token": "0123456789abcdef012345"
    }

## /users/auth/:token/passwordResetEmail [POST]

### response [202] Accepted

