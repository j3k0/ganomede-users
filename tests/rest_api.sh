#!/bin/bash

PREFIX=http://localhost:8001/users/v1

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
    docker-compose up --no-deps --no-recreate -d
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
WRONG_PASSWORD='"password":"nononon"'

it "registers the user"
    CURL $PREFIX/accounts -d "{$USERNAME, $PASSWORD, $EMAIL}"
    outputIncludes StormpathResourceError2001

it "logs the user in"
    CURL $PREFIX/login -d "{$USERNAME, $PASSWORD}"
    outputIncludes token

it "rejects invalid password"
    CURL $PREFIX/login -d "{$USERNAME, $WRONG_PASSWORD}"
    outputIncludes StormpathResourceError2006
