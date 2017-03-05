#!/bin/bash

# ugly fix for circleci
export PATH="$HOME/nvm/versions/node/v6.9.4/bin:$PATH"

set -e
export API_SECRET=secret
if [ -z "$SKIP_LINT" ]; then
    echo "eslint..."
    ./node_modules/.bin/eslint src/ tests/
    echo "coffeelint..."
    ./node_modules/.bin/coffeelint -q src tests
fi
BUNYAN_LEVEL=1000
MOCHA_ARGS="--bail --compilers coffee:coffee-script/register"
if [ -z "$1" ]; then
    MORE_MOCHA_ARGS=tests/**/test-*.coffee
fi
echo "mocha..."
./node_modules/.bin/mocha ${MOCHA_ARGS} ${MORE_MOCHA_ARGS} "$@"
# BUNYAN="./node_modules/.bin/bunyan -l ${BUNYAN_LEVEL}"
# ./node_modules/.bin/mocha ${MOCHA_ARGS} | ${BUNYAN}
