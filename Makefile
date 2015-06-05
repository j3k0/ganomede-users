BUNYAN_LEVEL?=1000

all: install test

check: install
	./node_modules/.bin/eslint src/
	./node_modules/.bin/coffeelint -q src tests

test: check
	./node_modules/.bin/mocha -b --compilers coffee:coffee-script/register tests | ./node_modules/.bin/bunyan -l ${BUNYAN_LEVEL}

coverage: test
	@mkdir -p doc
	./node_modules/.bin/mocha -b --compilers coffee:coffee-script/register --require blanket -R html-cov tests | ./node_modules/.bin/bunyan -l ${BUNYAN_LEVEL} > doc/coverage.html
	@echo "coverage exported to doc/coverage.html"

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

docker-prepare:
	@mkdir -p doc
	docker-compose up -d --no-recreate authRedis usermetaRedis usersRedisCache

docker-run: docker-prepare
	docker-compose run --rm --service-ports users make run BUNYAN_LEVEL=${BUNYAN_LEVEL}

docker-test: docker-prepare
	docker-compose run --rm users make test BUNYAN_LEVEL=${BUNYAN_LEVEL}

docker-coverage: docker-prepare
	docker-compose run --rm users make coverage

