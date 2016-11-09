#!/bin/sh
./node_modules/.bin/eslint src/
./node_modules/.bin/coffeelint -q src tests
BUNYAN_LEVEL=1000
MOCHA_ARGS="--bail --compilers coffee:coffee-script/register tests"
BUNYAN="./node_modules/.bin/bunyan -l ${BUNYAN_LEVEL}"
./node_modules/.bin/mocha ${MOCHA_ARGS} | ${BUNYAN}
