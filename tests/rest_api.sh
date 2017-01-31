#!/bin/bash

PREFIX=http://localhost:8001/users/v1

if [ "x$CLEANUP" = "x1" ]; then
    echo "Cleaning up database"
    docker-compose stop
    docker-compose rm -vf
    docker-compose up -d
    sleep 2
fi

set -e

function CURL() {
    docker-compose up --no-deps --no-recreate -d
    curl -s -H 'Content-type: application/json' "$@" > .curloutput.txt
    cat .curloutput.txt | json_pp > .testoutput.txt
}

function output() {
    cat .testoutput.txt
}

function outputIncludes() {
    output | grep "$@" > /dev/null || (echo "      FAIL" && false)
}

function outputExcludes() {
    output | grep "$@" > /dev/null || return 0
    echo "      FAIL" && false
}

function it() {
    echo "    - $@"
}

USERNAME='"username":"test123"'
PASSWORD='"password":"azerty12345678"'
EMAIL='"email":"test123@test.fovea.cc"'

it "registers the user"
CURL $PREFIX/accounts -d "{$USERNAME, $PASSWORD, $EMAIL}"
outputIncludes StormpathResourceError2001

it "logs the user in"
CURL $PREFIX/login -d "{$USERNAME, $PASSWORD}"
outputIncludes token
