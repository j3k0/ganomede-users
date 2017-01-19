# Events emited by ganomede-users

When a link to a [ganomede-events](https://github.com/j3k0/ganomede-events) API server is setup, ganomede-users will emit the following events
:

Events will be emited in the "users" channel, they'll all have the below format, with only the `type` that can change.

```json
{
    "channel": "users/v1",
    "from": "https://prod.ggs.ovh/users/v1",
    "type": "CREATED",
    "data": {
        "id": "hrry23",
        "aliases": {
            "name": "Harry",
            "tag": "harry",
            "email": "harryp@gmail.com",
            "facebook": "138193819083"
        }
    }
}
```

 * **channel**
   * always set to `"users/v1"`
 * **from**
   * Server and URL the originating request was made to (up to its `v1` component)
 * **type**
   * Either of "CREATE", "CHANGE", "LOGIN"

## Registration

 * `type`: `"CREATE"`
 * **emited when**: A new user is registered succesfully.

## Change

 * `type`: `"CHANGE"`
 * **emited when**: Some of the user's aliases have been changed successfully.

## Login

 * `type`: `"LOGIN"`
 * **emited when**: A user logged-in successfully.
