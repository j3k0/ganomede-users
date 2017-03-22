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

it "registers the user"
    CURL $PREFIX/accounts -d "{$USERNAME, $PASSWORD, $EMAIL, \"metadata\":{$COUNTRY, $BIRTH}}"
    CURL $PREFIX/accounts -d "{$USERNAME, $PASSWORD, $EMAIL, \"metadata\":{$COUNTRY, $BIRTH}}"
    outputIncludes StormpathResourceError2001

it "saves metadata at registrations"
    CURL $PREFIX/test124/metadata/country
    outputIncludes fr

it "logs the user in"
    CURL $PREFIX/login -d "{$USERNAME, $PASSWORD}"
    outputIncludes token

it "rejects invalid password"
    CURL $PREFIX/login -d "{$USERNAME, $WRONG_PASSWORD}"
    outputIncludes StormpathResourceError2006
