import fakeRestify from "./fake-restify";
import restify, { Server } from "restify";
import { expect } from 'chai';
import superagent from 'superagent';
import td, { DoubledObject, DoubledObjectWithKey } from 'testdouble';
import userApis from '../src/users-api';
import { AuthdbClient } from "../src/authentication";
import fakeAuthdb from "./fake-authdb";
import { DirectoryClient } from "../src/directory-client";
import { BackendInitializer, BackendOptions } from "../src/backend/directory";
import Logger from "bunyan";
import logMod from '../src/log';
import { RestError } from "restify-errors";
import { GanomedeSubscriptionClient, UsermetaClient, 
    UsermetaClientSingleOptions, UsernameKeyValue } from "../src/usermeta";
import { UsersApiOptions } from '../src/users-api';

// shortcuts for readability
const { anything, contains } = td.matchers;

const PREFIX = "users/v1";

const accounts = {
    alice: {
        id: "alice",
        aliases: {
            name: "alice-name",
            tag: "alice-tag",
            email: "alice@fovea.cc"
        }
    },
    bob: {
        id: "bob",
        aliases: {
            name: "bob-name",
            tag: "bob-tag",
            email: "bob@fovea.cc"
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

const ukv = (username, key) => ({
    username,
    key,
    value: username !== 'n0b0dy' ? `${username}-${key}` : null
});

let nextPort = 31109;

class Test {

    directoryClient: DirectoryClient;
    log: Logger;
    localUsermetaClient: DoubledObject<UsermetaClient>;
    centralUsermetaClient: DoubledObject<UsermetaClient>;
    ganomedeSubscriptionClient: DoubledObject<GanomedeSubscriptionClient>;
    backend: DoubledObjectWithKey<string>;
    createBackend: (options: BackendOptions) => BackendInitializer;
    authdbClient: AuthdbClient;

    constructor() {
        // Some mocks so we can initialize the `users` module.
        this.directoryClient = td.object(['editAccount', 'byId', 'byToken', 'byAlias']) as DirectoryClient;

        td.when(this.directoryClient.byAlias(
            contains({ type: "tag" }), td.callback))
            .thenDo((alias, cb) => {
                cb(null, BY_TAGS[alias.value] || null);
            });

        td.when(this.directoryClient.editAccount(
            td.matchers.anything(), td.callback))
            .thenCallback(null, null);

        Object.keys(accounts).forEach(id => {
            td.when(this.directoryClient.byId(contains({ id }), td.callback))
                .thenCallback(null, publicAccount(id));
            td.when(this.directoryClient.byId(contains({ id, secret: process.env.API_SECRET }), td.callback))
                .thenCallback(null, accounts.alice);
        });

        td.when(this.directoryClient.byId(contains({ id: 'n0b0dy' }), td.callback))
            .thenCallback(new RestError({
                restCode: 'UserNotFoundError',
                statusCode: 404,
                message: 'User not found: n0b0dy'
            }), null);

        this.log = logMod;
        this.log = td.object(['info', 'warn', 'error', 'debug']) as Logger;
        this.localUsermetaClient = td.object<UsermetaClient>();
        this.localUsermetaClient.type = 'GanomedeUsermeta@local';
        this.centralUsermetaClient = td.object<UsermetaClient>();
        this.centralUsermetaClient.type = 'GanomedeUsermeta@central';
        this.ganomedeSubscriptionClient = td.object<GanomedeSubscriptionClient>();

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
            email: accounts.alice.aliases.email
        });
    }

    initialize(server, done) {
        userApis.initialize(() => {
            userApis.addRoutes(PREFIX, server as unknown as restify.Server);
            server.listen(nextPort++, done);
        }, this);
    }

    mockBulkResponse(usernames: string[], keys: string[], type: 'local' | 'central') {
        const client = type === 'local' ? this.localUsermetaClient : this.centralUsermetaClient;
        const response: UsernameKeyValue[] = usernames.reduce((acc: UsernameKeyValue[], username: string) => {
            return [...acc, ...keys.map(key => ukv(username, key))];
        }, []);
        td.when(client.getBulk(td.matchers.contains({ usernames }), keys, td.callback))
            .thenCallback(null, response);
    }

    mockBulkForUserResponse(username: string, keys: string[], type: 'local' | 'central' | 'purchases') {
        const client = type === 'purchases' ? this.ganomedeSubscriptionClient : type === 'local' ? this.localUsermetaClient : this.centralUsermetaClient;
        const response: UsernameKeyValue[] = [username].reduce((acc: UsernameKeyValue[], username: string) => {
            return [...acc, ...keys.map(key => ukv(username, key))];
        }, []);
        td.when(client.getBulkForUser(td.matchers.contains({ username }), keys, td.callback))
            .thenCallback(null, response);
    }
}

const serverTools = () => {
    let server: Server;

    let test: Test;


    function prepareServer(done) {
        server = restify.createServer();
        server.use(restify.plugins.bodyParser());
        server.use(restify.plugins.queryParser());

        test = new Test();
        test.initialize(server, done);
    }

    function closeServer(done) {
        server.close();
        done();
    }

    function endpoint(path: string): string {
        return `http://localhost:${server.address().port}/${PREFIX}${path}`;
    }

    return { prepareServer, endpoint, closeServer, getTest: () => test };
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

    it('fails when token is invalid', (done) => {
        superagent
            .get(sTools.endpoint('/auth/invalid-token/multi/metadata/username,email'))
            .end((err, res) => {
                expect(res?.status, 'response status').to.equal(401);
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
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/username,email,tag'))
            .end((err, res) => {
                expect(res?.status, 'response status').to.equal(200);
                expect(res?.body, 'response body').to.eql([{
                    username: 'alice',
                    key: 'username',
                    value: 'alice'
                }, {
                    username: 'alice',
                    key: 'tag',
                    value: 'alice-tag'
                }, {
                    username: 'alice',
                    key: 'email',
                    value: 'alice@fovea.cc'
                }]);
                done();
            });
    });

    it('fetches protected metadata from the directory', (done) => {
        superagent
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/username,email,tag'))
            .end((err, res) => {
                expect(res?.status, 'response status').to.equal(200);
                expect(res?.body, 'response body').to.eql([{
                    username: 'alice',
                    key: 'username',
                    value: 'alice'
                }, {
                    username: 'alice',
                    key: 'tag',
                    value: 'alice-tag'
                }, {
                    username: 'alice',
                    key: 'email',
                    value: 'alice@fovea.cc'
                }]);

                td.verify(sTools.getTest().directoryClient.byId(anything(), anything()), { times: 1 });
                done();
            });
    });

    it('fetches the username without making a request', done => {
        superagent
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/username'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'username', value: 'alice' },
                ]);
                const directoryClient = sTools.getTest().directoryClient;
                td.verify(directoryClient.byId(anything(), anything()), { times: 0 });
                done();
            });
    });

    it('fetches data from the central usermeta module in a single request', done => {
        sTools.getTest().mockBulkForUserResponse('alice', ['country', 'yearofbirth'], 'central');
        superagent
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/country,yearofbirth'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                td.verify(sTools.getTest().centralUsermetaClient.getBulkForUser(
                    td.matchers.contains({ username: 'alice' }), ['country', 'yearofbirth'], td.matchers.anything()),
                    { times: 1 });
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'country', value: 'alice-country' },
                    { username: 'alice', key: 'yearofbirth', value: 'alice-yearofbirth' },
                ]);
                done();
            });
    });

    it('fetches data from the local usermeta module in a single request', done => {
        sTools.getTest().mockBulkForUserResponse('alice', ['key1', 'key2'], 'local');
        superagent
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/key1,key2'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                td.verify(sTools.getTest().localUsermetaClient.getBulkForUser(
                    td.matchers.contains({ username: 'alice' }),
                    ['key1', 'key2'],
                    td.matchers.anything()),
                    { times: 1 });
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'key1', value: 'alice-key1' },
                    { username: 'alice', key: 'key2', value: 'alice-key2' }
                ]);
                done();
            });
    });

    it('handles mixed types of metadata', done => {

        const test = sTools.getTest();
        test.mockBulkForUserResponse('alice', ['key1', 'key2'], 'local');
        test.mockBulkForUserResponse('alice', ['country', 'yearofbirth'], 'central');

        superagent
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/name,username,country,tag,key1,yearofbirth,key2'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;

                td.verify(test.directoryClient.byId(anything(), anything()), { times: 1 });

                td.verify(test.localUsermetaClient.getBulkForUser(anything(), anything(), anything()), { times: 1 });
                td.verify(test.centralUsermetaClient.getBulkForUser(anything(), anything(), anything()), { times: 1 });
                td.verify(test.localUsermetaClient.getBulk(anything(), anything(), anything()), { times: 0 });
                td.verify(test.centralUsermetaClient.getBulk(anything(), anything(), anything()), { times: 0 });

                expect(res?.body).to.eql([
                    { username: 'alice', key: 'name', value: 'alice-name' },
                    { username: 'alice', key: 'username', value: 'alice' },
                    { username: 'alice', key: 'tag', value: 'alice-tag' },
                    { username: 'alice', key: 'country', value: 'alice-country' },
                    { username: 'alice', key: 'yearofbirth', value: 'alice-yearofbirth' },
                    { username: 'alice', key: 'key1', value: 'alice-key1' },
                    { username: 'alice', key: 'key2', value: 'alice-key2' }
                ]);
                done();
            });
    });

    it.skip('support authentication spoofing', (done) => {
        const apiSecret = process.env.API_SECRET;
        superagent
            .get(sTools.endpoint(`/auth/${apiSecret}.alice/multi/metadata/username,email`))
            .end((err, res) => {
                expect(res?.status, 'response status').to.equal(200);
                done();
            });
    });


    describe('Subscription Virtual meta', () => {

        it('create a subscription client', () => {
            const subscriptionClient: GanomedeSubscriptionClient | null = GanomedeSubscriptionClient.createClient({ purchasesClient: {} });
            expect(subscriptionClient).to.be.not.null;

            const subscriptionClient2: GanomedeSubscriptionClient | null =
                GanomedeSubscriptionClient.createClient({
                    purchasesConfig: {
                        protocol: 0,
                        host: '',
                        port: 111
                    }
                });
            expect(subscriptionClient2).to.be.not.null;

            const subscriptionClient3: GanomedeSubscriptionClient | null = GanomedeSubscriptionClient.createClient({});
            expect(subscriptionClient3).to.be.null;

        });

        it('requires an authtoken', (done) => {
            const subscriptionClient: GanomedeSubscriptionClient | null = GanomedeSubscriptionClient.createClient({ purchasesClient: {} });
            subscriptionClient?.getBulkForUser({ username: 'alice' } as UsermetaClientSingleOptions, [], (err, res) => {
                expect(err, 'error').to.be.not.null;
                expect(err?.message, 'error').to.be.eql('Forbidden');
                done();
            });
        });

        it('fetches virtual metadata from the purchases', (done) => {
            sTools.getTest().mockBulkForUserResponse('alice', ['productId', 'platform', 'purchaseId'], 'purchases');
            superagent
                .get(sTools.endpoint('/auth/valid-token/multi/metadata/productId,platform,purchaseId'))
                .end((err, res) => {
                    expect(res?.status, 'response status').to.equal(200);
                    expect(res?.body, 'response body').to.eql([
                        { username: 'alice', key: 'productId', value: 'alice-productId' },
                        { username: 'alice', key: 'platform', value: 'alice-platform' },
                        { username: 'alice', key: 'purchaseId', value: 'alice-purchaseId' }
                    ]);

                    td.verify(sTools.getTest().ganomedeSubscriptionClient.getBulkForUser(anything(), anything(), anything()), { times: 1 });
                    done();
                });
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
        sTools.getTest().mockBulkResponse(['alice','bob'], ['public'], 'local');
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/public'))
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
                    { username: 'alice', key: 'username', value: 'alice' },
                    { username: 'alice', key: 'name', value: 'alice-name' },
                    { username: 'bob', key: 'username', value: 'bob' },
                    { username: 'bob', key: 'name', value: 'bob-name' }
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

    it('fetches the username without making a request', done => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/username'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'username', value: 'alice' },
                    { username: 'bob', key: 'username', value: 'bob' },
                ]);
                const directoryClient = sTools.getTest().directoryClient;
                td.verify(directoryClient.byId(anything(), anything()), { times: 0 });
                done();
            });
    });

    it('fetches data from the public directory in the minimal number of requests', done => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/name,tag'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'name', value: 'alice-name' },
                    { username: 'alice', key: 'tag', value: 'alice-tag' },
                    { username: 'bob', key: 'name', value: 'bob-name' },
                    { username: 'bob', key: 'tag', value: 'bob-tag' },
                ]);
                // 1 request for alice, 1 request for bob.
                td.verify(sTools.getTest().directoryClient.byId(td.matchers.anything(), td.matchers.anything()), { times: 2 });
                done();
            });
    });

    it('fetches data from the central usermeta module in a single request', done => {
        sTools.getTest().mockBulkResponse(['alice','bob'], ['country','yearofbirth'], 'central');
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/country,yearofbirth'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                td.verify(sTools.getTest().centralUsermetaClient.getBulk(
                    td.matchers.contains({usernames: ['alice', 'bob']}), ['country', 'yearofbirth'], td.matchers.anything()),
                    { times: 1 });
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'country', value: 'alice-country' },
                    { username: 'alice', key: 'yearofbirth', value: 'alice-yearofbirth' },
                    { username: 'bob', key: 'country', value: 'bob-country' },
                    { username: 'bob', key: 'yearofbirth', value: 'bob-yearofbirth' },
                ]);
                done();
            });
    });

    it('fetches data from the local usermeta module in a single request', done => {
        sTools.getTest().mockBulkResponse(['alice','bob'], ['key1','key2'], 'local');
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/key1,key2'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                td.verify(sTools.getTest().localUsermetaClient.getBulk(
                    td.matchers.contains({usernames: ['alice', 'bob']}),
                    ['key1', 'key2'],
                    td.matchers.anything()),
                    { times: 1 });
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'key1', value: 'alice-key1' },
                    { username: 'alice', key: 'key2', value: 'alice-key2' },
                    { username: 'bob', key: 'key1', value: 'bob-key1' },
                    { username: 'bob', key: 'key2', value: 'bob-key2' },
                ]);
                done();
            });
    });

    it('handles non existing users with default values in the directory', done => {
        superagent
            .get(sTools.endpoint('/multi/metadata/n0b0dy/name,username,tag'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body).to.eql([
                    { username: 'n0b0dy', key: 'name', value: 'n0b0dy' },
                    { username: 'n0b0dy', key: 'username', value: 'n0b0dy' },
                    { username: 'n0b0dy', key: 'tag', value: 'nobody' },
                ]);
                done();
            });
    });

    it('should not fetch protected metadata from the directory', done => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice/email'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'email', value: null }
                ]);
                done();
            });
    });

    it('should not fetch protected metadata from ganomede-usermeta', done => {
        const { localUsermetaClient } = sTools.getTest();
        td.when(localUsermetaClient.getBulk(
            contains({usernames:['alice']}), ['protected'], td.callback))
            .thenCallback(null, { username: 'alice', key: 'protected' });
        superagent
            .get(sTools.endpoint('/multi/metadata/alice/protected'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'protected' },
                ]);
                // important: the api secret was not provided!
                td.verify(localUsermetaClient.getBulk(
                    contains({usernames:['alice'], apiSecret: process.env.API_SECRET}), anything(), td.callback),
                    { times: 0 });
                done();
            });
    });

    it('can fetch protected metadata when the secret key is provided', done => {
        const { localUsermetaClient, directoryClient } = sTools.getTest();
        td.when(localUsermetaClient.getBulk(contains({ usernames:['alice'] }), ['protected'], td.callback))
            .thenCallback(null, { username: 'alice', key: 'protected' });
        td.when(localUsermetaClient.getBulk(contains({ usernames:['alice'], apiSecret: process.env.API_SECRET }), ['protected'], td.callback))
            .thenCallback(null, { username: 'alice', key: 'protected', value: 'my-secret' });
        superagent
            .get(sTools.endpoint('/multi/metadata/alice/email,protected?secret=' + process.env.API_SECRET))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                td.verify(localUsermetaClient.getBulk(contains({ usernames: ['alice'], apiSecret: process.env.API_SECRET }), ['protected'], td.callback));
                td.verify(directoryClient.byId(contains({ id: 'alice', secret: process.env.API_SECRET }), td.callback));
                expect(res?.body).to.eql([
                    { username: 'alice', key: 'email', value: "alice@fovea.cc" },
                    { username: 'alice', key: 'protected', value: "my-secret" },
                ]);
                done();
            });
    });

    it('handles mixed types of metadata', done => {

        const test = sTools.getTest();
        test.mockBulkResponse(['alice','bob','n0b0dy'], ['key1','key2'], 'local');
        test.mockBulkResponse(['alice','bob','n0b0dy'], ['country','yearofbirth'], 'central');

        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob,n0b0dy/name,username,country,tag,key1,yearofbirth,key2'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;

                td.verify(test.directoryClient.byId(anything(), anything()), { times: 3 });

                td.verify(test.localUsermetaClient.getBulk(anything(), anything(), anything()), { times: 1 });
                td.verify(test.centralUsermetaClient.getBulk(anything(), anything(), anything()), { times: 1 });
                td.verify(test.localUsermetaClient.get(anything(), anything(), anything()), { times: 0 });
                td.verify(test.centralUsermetaClient.get(anything(), anything(), anything()), { times: 0 });

                expect(res?.body).to.eql([
                    { username: 'alice', key: 'name', value: 'alice-name' },
                    { username: 'alice', key: 'username', value: 'alice' },
                    { username: 'alice', key: 'tag', value: 'alice-tag' },
                    { username: 'bob', key: 'name', value: 'bob-name' },
                    { username: 'bob', key: 'username', value: 'bob' },
                    { username: 'bob', key: 'tag', value: 'bob-tag' },
                    { username: 'n0b0dy', key: 'name', value: 'n0b0dy' },
                    { username: 'n0b0dy', key: 'username', value: 'n0b0dy' },
                    { username: 'n0b0dy', key: 'tag', value: 'nobody' },
                    { username: 'alice', key: 'country', value: 'alice-country' },
                    { username: 'alice', key: 'yearofbirth', value: 'alice-yearofbirth' },
                    { username: 'bob', key: 'country', value: 'bob-country' },
                    { username: 'bob', key: 'yearofbirth', value: 'bob-yearofbirth' },
                    { username: 'n0b0dy', key: 'country', value: null },
                    { username: 'n0b0dy', key: 'yearofbirth', value: null },
                    { username: 'alice', key: 'key1', value: 'alice-key1' },
                    { username: 'alice', key: 'key2', value: 'alice-key2' },
                    { username: 'bob', key: 'key1', value: 'bob-key1' },
                    { username: 'bob', key: 'key2', value: 'bob-key2' },
                    { username: 'n0b0dy', key: 'key1', value: null},
                    { username: 'n0b0dy', key: 'key2', value: null }
                ]);
                done();
            });
    });

    describe('integrated tests', () => {

        let server = restify.createServer();
        let port = 12911;

        function endpoint(path: string): string {
            return `http://localhost:${server.address().port}${path}`;
        }

        beforeEach(function(done) {
            ++port;
            server = restify.createServer();
            server.use(restify.plugins.bodyParser());
            server.use(restify.plugins.queryParser());
            const options: UsersApiOptions = {
                log: td.object<Logger>(),
                directoryClient: td.object<DirectoryClient>(),

            };
            Object.assign(process.env, {
                CENTRAL_USERMETA_PORT_8000_TCP_ADDR: 'localhost',
                CENTRAL_USERMETA_PORT_8000_TCP_PORT: '' + port,
                LOCAL_USERMETA_PORT_8000_TCP_ADDR: 'localhost',
                LOCAL_USERMETA_PORT_8000_TCP_PORT: '' + port,
                FACEBOOK_APP_ID: '0'
            });
            userApis.initialize(() => {
                userApis.addRoutes('users/v1', server);
                server.listen(port, () => {
                    done();
                });
            }, options);
        });

        afterEach(done => {
            server.close();
            done();
        });

        it('does works with a single user - issue #76', done => {
            // Fake usermeta response
            server.get('/usermeta/v1/:usernames/:keys', (req, res, next) => {
                expect(req.params.usernames).to.equal('user1');
                expect(req.params.keys).to.equal('key1,key2');
                // req.log.info("GET from usermeta");
                res.json({
                    user1: {
                        key1: "1x1",
                        key2: "1x2"
                    }
                });
                next();
            });
            superagent
                .get(endpoint('/users/v1/multi/metadata/user1/key1,key2'))
                .end((err, res) => {
                    expect(err, 'response error').to.be.null;
                    expect(res?.status, 'response status').to.equal(200);
                    expect(res?.body, 'response').to.eql([{
                        username: 'user1',
                        key: 'key1',
                        value: '1x1'
                    }, {
                        username: 'user1',
                        key: 'key2',
                        value: '1x2'
                    }]);
                    done();
                });
        });

        it('does not fail with multiple users - issue #76', done => {
            // Fake usermeta response
            server.get('/usermeta/v1/:usernames/:keys', (req, res, next) => {
                expect(req.params.usernames).to.equal('user1,user2');
                expect(req.params.keys).to.equal('key1,key2');
                // req.log.info("GET from usermeta");
                res.json({
                    user1: {
                        key1: "1x1",
                        key2: "1x2"
                    },
                    user2: {
                        key1: "2x1",
                        key2: "2x2"
                    }
                });
                next();
            });
            superagent
                .get(endpoint('/users/v1/multi/metadata/user1,user2/key1,key2'))
                .end((err, res) => {
                    expect(err, 'response error').to.be.null;
                    expect(res?.status, 'response status').to.equal(200);
                    expect(res?.body, 'response').to.eql([{
                        username: 'user1',
                        key: 'key1',
                        value: '1x1'
                    }, {
                        username: 'user1',
                        key: 'key2',
                        value: '1x2'
                    }, {
                        username: 'user2',
                        key: 'key1',
                        value: '2x1'
                    }, {
                        username: 'user2',
                        key: 'key2',
                        value: '2x2'
                    }]);
                    done();
                });
        });
    });

});
