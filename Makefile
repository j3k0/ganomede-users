BUNYAN_LEVEL?=1000
MOCHA_ARGS=--bail --compilers coffee:coffee-script/register tests
BUNYAN=./node_modules/.bin/bunyan -l ${BUNYAN_LEVEL}

all: Dockerfile.dev install test

check: install
	./node_modules/.bin/eslint src/
	./node_modules/.bin/coffeelint -q src tests

test: check
	./node_modules/.bin/mocha ${MOCHA_ARGS} | ${BUNYAN}

testw:
	./node_modules/.bin/mocha --watch ${MOCHA_ARGS} | ${BUNYAN}

coverage: test
	./node_modules/.bin/mocha -b --compilers coffee:coffee-script/register --require coffee-coverage/register-istanbul tests/
	./node_modules/.bin/istanbul report
	@echo "coverage exported to file://`pwd`/coverage/lcov-report/index.html"

run: check
	node index.js | ./node_modules/.bin/bunyan -l ${BUNYAN_LEVEL}

start-daemon:
	node_modules/.bin/forever start index.js

stop-daemon:
	node_modules/.bin/forever stop index.js

install: node_modules

node_modules: package.json
	npm install
	@touch node_modules

clean:
	rm -fr node_modules

Dockerfile.dev: Dockerfile Makefile
	sed "s/npm install --production/npm install/g" Dockerfile > Dockerfile.dev
	echo COPY run_tests.sh /home/app/code/ >> Dockerfile.dev

docker-prepare: Dockerfile.dev
	@mkdir -p doc
	docker-compose up -d --no-recreate authRedis usermetaRedis usersRedisCache

docker-run: docker-prepare
	docker-compose run --rm --service-ports users make run BUNYAN_LEVEL=${BUNYAN_LEVEL}

docker-test: docker-prepare
	docker-compose run --rm users make test BUNYAN_LEVEL=${BUNYAN_LEVEL}

docker-coverage: docker-prepare
	docker-compose run --rm users make coverage

