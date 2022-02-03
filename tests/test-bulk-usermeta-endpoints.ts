import fakeRestify from "./fake-restify";
import restify, { Server } from "restify";
import { expect } from 'chai';
import superagent from 'superagent';
import td, { DoubledObjectWithKey } from 'testdouble';
import userApis from '../src/users-api';
import { AuthdbClient } from "../src/authentication";
import fakeAuthdb from "./fake-authdb";
import { DirectoryClient } from "../src/directory-client";
import { UsermetaClient } from "../src/usermeta";
import { BackendInitializer, BackendOptions } from "../src/backend/directory";
import Logger from "bunyan";
import logMod from '../src/log';
import fakeUsermeta, { FakeUsermetaClient } from './fake-usermeta';
import { UnauthorizedError } from "restify-errors";

const anything = td.matchers.anything;

const PREFIX = "users/v1";

const accounts = {
    alice: {
        id: "alice",
        aliases: {
            name: "alice-name",
            tag: "alice-tag"
        }
    },
    bob: {
        id: "bob",
        aliases: {
            name: "bob-name",
            tag: "bob-tag"
        }
    },
    charles: {
        id: "charles",
        aliases: {
            name: "charles-name",
            tag: "charles-tag"
        }
    }
};

function publicAccount(id) {
    const acc = accounts[id];
    return {
        id: acc.id,
        aliases: {
            name: acc.aliases.name,
            tag: acc.aliases.tag,
        }
    };
}

const BY_TAGS = Object.values(accounts).reduce((acc, value) => {
    return { 
        [value.aliases.tag]: publicAccount(value.id),
        ...acc
    };
}, {});

const dataForPost = [{
    key: "name",
    value: "alice1"
}, {
    key: "email",
    value: "test@test.com"
}];

class Test {

    directoryClient: DirectoryClient;
    log: Logger;
    localUsermetaClient: FakeUsermetaClient;
    centralUsermetaClient: FakeUsermetaClient;
    backend: DoubledObjectWithKey<string>;
    createBackend: (options: BackendOptions) => BackendInitializer;
    authdbClient: AuthdbClient;

    constructor() {
        // Some mocks so we can initialize the `users` module.
        this.directoryClient = td.object(['editAccount', 'byId', 'byToken', 'byAlias']) as DirectoryClient;

        td.when(this.directoryClient.byAlias(
            td.matchers.contains({ type: "tag" }),
            td.matchers.isA(Function)))
            .thenDo((alias, cb) => {
                cb(null, BY_TAGS[alias.value] || null);
            });

        td.when(this.directoryClient.editAccount(
            td.matchers.anything(), td.callback))
            .thenCallback(null, null);

        Object.keys(accounts).forEach(id => {
            td.when(this.directoryClient.byId(td.matchers.contains({ id }), td.callback))
                .thenCallback(null, publicAccount(id));
        });

        this.log = logMod;
        this.log = td.object(['info', 'warn', 'error', 'debug']) as Logger;
        this.localUsermetaClient = fakeUsermeta.createClient();
        this.centralUsermetaClient = fakeUsermeta.createClient();
        Object.keys(accounts).forEach(username => {
            this.localUsermetaClient.store[`${username}:key1`] = `${username}-key1`;
            this.localUsermetaClient.store[`${username}:key2`] = `${username}-key2`;
            this.centralUsermetaClient.store[`${username}:country`] = `${username}-country`;
            this.centralUsermetaClient.store[`${username}:yearofbirth`] = `${username}-yearofbirth`;
        });
        this.backend = td.object(['initialize']);
        this.createBackend = td.function('createBackend') as (options: BackendOptions) => BackendInitializer;

        td.when(
            this.createBackend(td.matchers.isA(Object)))
            .thenReturn(this.backend);
        td.when(
            this.backend.initialize())
            .thenCallback(null, this.backend);
        this.authdbClient = fakeAuthdb.createClient();
        this.authdbClient.addAccount("valid-token", {
            username: "alice",
            email: 'alice@test.com'
        });
    }

    initialize(server, port, done) {
        userApis.initialize(() => {
            userApis.addRoutes(PREFIX, server as unknown as restify.Server);
            server.listen(port++, done);
        }, this);
    }
}

const serverTools = () => {
    let server: Server;

    let port = 31009;
    let test: Test;


    function prepareServer(done) {
        server = restify.createServer();
        server.use(restify.plugins.bodyParser());
        server.use(restify.plugins.queryParser());

        test = new Test();
        test.initialize(server, port, done);
    }

    function closeServer(done) {
        server.close();
        done();
    }

    function endpoint(path: string): string {
        return `http://localhost:${server.address().port}/${PREFIX}${path}`;
    }

    return { prepareServer, endpoint, closeServer, getTest: () => test};
}

describe('GET /auth/:authToken/multi/metadata/:keys', () => {

    const sTools = serverTools();

    beforeEach(sTools.prepareServer);
    afterEach(sTools.closeServer);

    it('checks if endpoint `/users/v1/auth/:authToken/multi/metadata/:keys [GET]` exists', () => {
        const server = fakeRestify.createServer();
        userApis.addRoutes(PREFIX, server as unknown as restify.Server);
        expect(server.routes.get[`/${PREFIX}/auth/:authToken/multi/metadata/:keys`], 'get /users/v1/auth/:authToken/multi/metadata/:keys route').to.be.ok;
    });

    it('should respond', (done) => {
        superagent
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/username,email'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.status, 'response status').to.equal(200);
                done();
            });
    });

    it('fails when token is not provided', (done) => {
        superagent
            .get(sTools.endpoint('/auth/multi/metadata/username,email'))
            .end((err, res) => {
                expect(res?.status, 'response status').to.equal(401);
                done();
            });
    });

    it('returns empty array when no keys provided', (done) => {
        superagent
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body, 'response body').to.be.eql([]);
                done();
            });
    });

    it('returns array of key-value pairs', (done) => {
        superagent
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/username,email'))
            .end((err, res) => {
                expect(res?.status, 'response status').to.equal(200);
                expect(res?.body[0], 'response body').to.have.property('key');
                expect(res?.body[0], 'response body').to.have.property('value');
                done();
            });
    });

});


describe('POST /auth/:authToken/multi/metadata', () => {

    const sTools = serverTools();

    beforeEach(sTools.prepareServer);
    afterEach(sTools.closeServer);

    it('checks if endpoint `/users/v1/auth/:authToken/multi/metadata [POST]` exists', () => {
        const server = fakeRestify.createServer();
        userApis.addRoutes(PREFIX, server as unknown as restify.Server);
        expect(server.routes.post[`/${PREFIX}/auth/:authToken/multi/metadata`], 'get /users/v1/auth/:authToken/multi/metadata route').to.be.ok;
    });

    it('should respond', (done) => {
        superagent
            .post(sTools.endpoint('/auth/valid-token/multi/metadata'))
            .send(dataForPost)
            .end(function (err, res) {
                expect(err, 'request error').to.be.null;
                expect(res?.status, 'response status').to.equal(200);
                done();
            });
    });

    it('returns unauthorized when token is not valid', (done) => {
        superagent
            .post(sTools.endpoint('/auth/00000/multi/metadata'))
            .send(dataForPost)
            .end(function (err, res) {
                expect(res?.status, 'response status').to.equal(401);
                done();
            });
    });
});


describe('GET /multi/metadata/:userIds/:keys', () => {

    const sTools = serverTools();

    beforeEach(sTools.prepareServer);
    afterEach(sTools.closeServer);

    it('checks if endpoint `/users/v1/multi/metadata/:userIds/:keys [GET]` exists', () => {
        const server = fakeRestify.createServer();
        userApis.addRoutes(PREFIX, server as unknown as restify.Server);
        expect(server.routes.get[`/${PREFIX}/multi/metadata/:userIds/:keys`], 'get /users/v1/multi/metadata/:userIds/:keys route').to.be.ok;
    });

    it('should respond', (done) => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/username,email'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.status, 'response status').to.equal(200);
                done();
            });
    });

    it('returns array of key-value-username pairs', (done) => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/username,name'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body).to.eql([
                    {username: 'alice', key: 'username', value: 'alice'},
                    {username: 'alice', key: 'name', value: 'alice-name'},
                    {username: 'bob', key: 'username', value: 'bob'},
                    {username: 'bob', key: 'name', value: 'bob-name'}
                ]);
                done();
            });
    });

    it('returns array that matches the requested users+keys', (done) => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/username,name'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body.length, 'response body length').to.equal(4);
                done();
            });
    });

    it('fetches the username without make a request', done => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/username'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body).to.eql([
                    {username: 'alice', key: 'username', value: 'alice'},
                    {username: 'bob', key: 'username', value: 'bob'},
                ]);
                td.verify(sTools.getTest().directoryClient.byId(td.matchers.anything(), td.matchers.anything()), { times: 0 });
                done();
            });
    });

    it('fetches data from the public directory in the minimal number of requests', done => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/name,tag'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body).to.eql([
                    {username: 'alice', key: 'name', value: 'alice-name'},
                    {username: 'alice', key: 'tag', value: 'alice-tag'},
                    {username: 'bob', key: 'name', value: 'bob-name'},
                    {username: 'bob', key: 'tag', value: 'bob-tag'},
                ]);
                // 1 request for alice, 1 request for bob.
                td.verify(sTools.getTest().directoryClient.byId(td.matchers.anything(), td.matchers.anything()), { times: 2 });
                done();
            });
    });

    it('fetches data from the central usermeta module in a single request', done => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/country,yearofbirth'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(sTools.getTest().centralUsermetaClient.callCounts.getBulk).to.equal(1);
                expect(res?.body).to.eql([
                    {username: 'alice', key: 'country', value: 'alice-country'},
                    {username: 'alice', key: 'yearofbirth', value: 'alice-yearofbirth'},
                    {username: 'bob', key: 'country', value: 'bob-country'},
                    {username: 'bob', key: 'yearofbirth', value: 'bob-yearofbirth'},
                ]);
                done();
            });
    });
    
    it('fetches data from the local usermeta module in a single request', done => {
        superagent
        .get(sTools.endpoint('/multi/metadata/alice,bob/key1,key2'))
        .end((err, res) => {
            expect(err, 'request error').to.be.null;
            expect(sTools.getTest().localUsermetaClient.callCounts.getBulk).to.equal(1);
            expect(res?.body).to.eql([
                {username: 'alice', key: 'key1', value: 'alice-key1'},
                {username: 'alice', key: 'key2', value: 'alice-key2'},
                {username: 'bob', key: 'key1', value: 'bob-key1'},
                {username: 'bob', key: 'key2', value: 'bob-key2'},
            ]);
            done();
        });
    });

    it('handles mixed types of metadata', done => {

        td.when(sTools.getTest().directoryClient.byId(td.matchers.contains({ id: 'nobody' }), td.callback))
            .thenCallback(new Error('notfound'), null);

        superagent
        .get(sTools.endpoint('/multi/metadata/alice,bob,nobody/name,username,country,tag,key1,yearofbirth,key2'))
        .end((err, res) => {
            expect(err, 'request error').to.be.null;

                td.verify(sTools.getTest().directoryClient.byId(td.matchers.anything(), td.matchers.anything()), { times: 3 });
                expect(sTools.getTest().centralUsermetaClient.callCounts.getBulk).to.equal(1);
                expect(sTools.getTest().centralUsermetaClient.callCounts.get).to.equal(0);
                expect(sTools.getTest().localUsermetaClient.callCounts.getBulk).to.equal(0);
                expect(sTools.getTest().localUsermetaClient.callCounts.get).to.equal(0);

                expect(res?.body).to.eql([
                    { username: 'alice', key: 'name', value: 'alice-name' },
                    { username: 'alice', key: 'username', value: 'alice' },
                    { username: 'alice', key: 'tag', value: 'alice-tag' },
                    { username: 'bob', key: 'name', value: 'bob-name' },
                    { username: 'bob', key: 'username', value: 'bob' },
                    { username: 'bob', key: 'tag', value: 'bob-tag' },
                    { username: 'nobody', key: 'name', value: '' },
                    { username: 'nobody', key: 'username', value: 'nobody' },
                    { username: 'nobody', key: 'tag', value: '' },
                    { username: 'alice', key: 'country', value: 'alice-country' },
                    { username: 'alice', key: 'key1' },
                    { username: 'alice', key: 'yearofbirth', value: 'alice-yearofbirth' },
                    { username: 'alice', key: 'key2' },
                    { username: 'bob', key: 'country', value: 'bob-country' },
                    { username: 'bob', key: 'key1' },
                    { username: 'bob', key: 'yearofbirth', value: 'bob-yearofbirth' },
                    { username: 'bob', key: 'key2' },
                    { username: 'nobody', key: 'country' },
                    { username: 'nobody', key: 'key1' },
                    { username: 'nobody', key: 'yearofbirth' },
                    { username: 'nobody', key: 'key2' }
                ]);
                done();
            });
    });

});