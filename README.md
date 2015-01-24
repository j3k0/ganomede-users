Users' API
----------

# Metadata

## /users/:id/metadata/:id [GET]

## /users/:id/metadata/:id [POST]

# User accounts

User accounts API is fully inspired by Stormpath.

See http://docs.stormpath.com/rest/product-guide/#application-accounts when in doubt about a parameter.

## /users/accounts [POST]

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

## /users/accounts/:login [GET]

### response [200] OK

    {
        "username": "tk421",
        "givenName": "Joe",
        "surname": "Stormtrooper",
        "email": "tk421@stormpath.com"
    }

## /users/login [POST]

### response [200] OK

    {
        "token": "0123456789abcdef012345"
    }

### body (application/json)

    {
        "type": "basic",
        "value": "0123456789abcdef012345"
    }

## /users/verificationEmails

### body (application/json)

    {
        login: 'tk421'
    }

### response [202] Accepted

