#!/bin/bash

BASE_URL="${BASE_URL:-http://localhost:8000}"
PREFIX="${BASE_URL}/users/v1"

function json_pp() {
    xargs -0 node -e "console.log(JSON.stringify(JSON.parse(process.argv[1]), null, 2))"
}

DC="docker-compose -f docker-compose.test.yml -f docker-compose.override.yml"

if [ "x$FULL_CLEANUP" = "x1" ]; then
    echo "Cleaning up database"
    $DC stop
    $DC rm -vf
    $DC up -d
    sleep 2
elif [ "x$CLEANUP" = "x1" ]; then
    $DC kill users
    $DC rm -vf users
    $DC up --no-deps --no-recreate -d users
    sleep 2
fi

set -e

function CURL() {
    if [ "x$RECREATE" = "x1" ]; then
        $DC up --no-deps --no-recreate -d
    fi
    curl -s -H 'Content-type: application/json' "$@" > .curloutput.txt ||
        curl -H 'Content-type: application/json' "$@"
    cat .curloutput.txt | json_pp > .testoutput.txt
}

function output() {
    cat .testoutput.txt
}

function outputIncludes() {
    output | grep "$@" > /dev/null || (echo "      FAIL" && output && false)
}

function outputExcludes() {
    output | grep "$@" > /dev/null || return 0
    echo "      FAIL" && false
}

function it() {
    echo "    - $@"
}

USERNAME='"username":"test124"'
PASSWORD='"password":"azerty12345678"'
EMAIL='"email":"test124@test.fovea.cc"'
COUNTRY='"country":"fr"'
BIRTH='"yearofbirth":"2015"'
DISABLECHAT='"$chatdisabled":"true"'
WRONG_PASSWORD='"password":"nononon"'

it "[POST /accounts] registers the user"
    CURL $PREFIX/accounts -d "{$USERNAME, $PASSWORD, $EMAIL, \"metadata\":{$COUNTRY, $BIRTH}}"
    CURL $PREFIX/accounts -d "{$USERNAME, $PASSWORD, $EMAIL, \"metadata\":{$COUNTRY, $BIRTH}}"
    outputIncludes StormpathResourceError2001

it "[GET  /:username/metadata/country] saves metadata at registrations"
    CURL $PREFIX/test124/metadata/country
    outputIncludes fr

it "[POST /login] logs the user in"
    CURL $PREFIX/login -d "{$USERNAME, $PASSWORD}"
    outputIncludes token

it "[POST /login] rejects invalid password"
    CURL $PREFIX/login -d "{$USERNAME, $WRONG_PASSWORD}"
    outputIncludes StormpathResourceError2006

it "[POST /:username/metadata/\$chatdisabled] does not allow setting other users metadata"
    CURL $PREFIX/test124/metadata/\$chatdisabled -d '{"value": "true"}'
    outputIncludes MethodNotAllowed

CURL $PREFIX/login -d "{$USERNAME, $PASSWORD}"
TOKEN="$(output | jq -r .token)"
echo "    - [Login TOKEN] $TOKEN"

function cleanup() {
    CURL -X DELETE $PREFIX/auth/$TOKEN/friends/test2
    CURL -X DELETE $PREFIX/auth/$TOKEN/friends/test3
    CURL -X DELETE $PREFIX/auth/$TOKEN/blocked-users/bob
    CURL -X DELETE $PREFIX/auth/$TOKEN/blocked-users/roger
}

it "[Initial cleanup]"
    cleanup

it "[POST /auth/:token/metadata/\$chatdisabled] sets chatdisabled metadata into local usermeta"
    CURL $PREFIX/auth/$TOKEN/metadata/\$chatdisabled -d '{"value": "true"}'
    outputIncludes true

it "[GET  /auth/:token/metadata/\$chatdisabled] loads chatdisabled metadata from local usermeta"
    CURL $PREFIX/auth/$TOKEN/metadata/\$chatdisabled
    outputIncludes true

it "[POST /auth/:token/reported-users] reports a user"
    CURL $PREFIX/auth/$TOKEN/reported-users -d '{"username": "roger"}'
    outputIncludes '"roger"'

it "[GET /users/v1/admin/reported-users] returns recently reported users"
    CURL $PREFIX/admin/reported-users?secret=$API_SECRET
    outputIncludes '"roger"'

it "[GET  /auth/:token/blocked-users] returns blocked users"
    CURL $PREFIX/auth/$TOKEN/blocked-users
    outputIncludes '"roger"'

it "[POST /auth/:token/blocked-users] blocks a user"
    CURL $PREFIX/auth/$TOKEN/blocked-users -d '{"username": "bob"}'
    outputIncludes '"roger"'
    outputIncludes '"bob"'

it "[GET /admin/blocks/:username] returns the list of block"
    CURL $PREFIX/admin/blocks/test124?secret=$API_SECRET
    outputIncludes '"roger"'
    outputIncludes '"bob"'

it "[DEL  /auth/:token/blocked-users/:tag] unblocks a user"
    CURL -X DELETE $PREFIX/auth/$TOKEN/blocked-users/bob
    outputExcludes '"bob"'

it "[GET /auth/:token/friends] returns friends"
    CURL $PREFIX/auth/$TOKEN/friends
    outputIncludes '\['
    outputIncludes '\]'

it "[POST /auth/:token/friends] add friends"
    CURL $PREFIX/auth/$TOKEN/friends -d '["test1","test2"]'
    outputIncludes '"ok"'
    outputIncludes 'true'

it "[GET  /auth/:token/friends] contains added friends"
    CURL $PREFIX/auth/$TOKEN/friends
    outputIncludes '"test1"'
    outputIncludes '"test2"'

it "[POST /auth/:token/friends] add more friends"
    CURL $PREFIX/auth/$TOKEN/friends -d '["test1","test3"]'
    outputIncludes '"ok"'
    outputIncludes 'true'
    CURL $PREFIX/auth/$TOKEN/friends
    outputIncludes '"test1"'
    outputIncludes '"test2"'
    outputIncludes '"test3"'

it "[DEL /auth/:token/friends/:tag] remove a friend"
    CURL -X DELETE $PREFIX/auth/$TOKEN/friends/test1
    outputIncludes '"ok"'
    outputIncludes 'true'
    CURL $PREFIX/auth/$TOKEN/friends
    outputExcludes '"test1"'
    outputIncludes '"test2"'
    outputIncludes '"test3"'

#final cleanup
it "[Final cleanup]"
    cleanup
