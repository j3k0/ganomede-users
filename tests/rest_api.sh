#!/bin/bash

BASE_URL="${BASE_URL:-http://localhost:8000}"
PREFIX="${BASE_URL}/users/v1"

function json_pp() {
    xargs -0 node -e "console.log(JSON.stringify(JSON.parse(process.argv[1]), null, 2))"
}

if [ "x$FULL_CLEANUP" = "x1" ]; then
    echo "Cleaning up database"
    docker-compose stop
    docker-compose rm -vf
    docker-compose up -d
    sleep 2
elif [ "x$CLEANUP" = "x1" ]; then
    docker kill ganomedeusers_users_1; docker rm -vf ganomedeusers_users_1
    docker-compose up --no-deps --no-recreate -d users
    sleep 2
fi

set -e

function CURL() {
    if [ "x$RECREATE" = "x1" ]; then
        docker-compose up --no-deps --no-recreate -d
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

CURL $PREFIX/login -d "{$USERNAME, $PASSWORD}"
TOKEN="$(output | jq -r .token)"

it "[GET  /auth/:token/blocked-users] returns blocked users"
    CURL $PREFIX/auth/$TOKEN/blocked-users
    outputIncludes '\[\]'

it "[POST /auth/:token/blocked-users] blocks a user"
    CURL $PREFIX/auth/$TOKEN/blocked-users -d '{"username": "bob"}'
    outputIncludes '"bob"'

it "[DEL  /auth/:token/blocked-users/:tag] unblocks a user"
    CURL -X DELETE $PREFIX/auth/$TOKEN/blocked-users/bob
    outputExcludes '"bob"'