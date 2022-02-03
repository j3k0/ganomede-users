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
import fakeUsermeta from './fake-usermeta';
import { UnauthorizedError } from "restify-errors";

const PREFIX = "users/v1";

const TAGS = {
    "charies-tag": "charles",
};

const alice_publicAccount = {
    id: "alice",
    aliases: {
        name: "alice-name",
        tag: "alice-tag"
    }
};


const bob_publicAccount = {
    id: "bob",
    aliases: {
        name: "bob-name",
        tag: "bob-tag"
    }
};

const dataForPost = [{
    "key": "name",
    "value": "alice1"
}, {
    "key": "email",
    "value": "test@test.com"
}]

class Test {

    directoryClient: DirectoryClient;
    log: Logger;
    localUsermetaClient: UsermetaClient;
    centralUsermetaClient: UsermetaClient;
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
                cb(null, TAGS[alias.value] ? { id: TAGS[alias.value] } : null);
            });

        td.when(this.directoryClient.editAccount(
            td.matchers.anything(), td.callback))
            .thenCallback(null, null);

        td.when(this.directoryClient.byId(td.matchers.contains({ id: "alice" }), td.callback))
            .thenCallback(null, alice_publicAccount);

        td.when(this.directoryClient.byId(td.matchers.contains({ id: "bob" }), td.callback))
            .thenCallback(null, bob_publicAccount);

        this.log = logMod;
        this.log = td.object(['info', 'warn', 'error', 'debug']) as Logger;
        this.localUsermetaClient = fakeUsermeta.createClient();
        this.centralUsermetaClient = fakeUsermeta.createClient();
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



    return { prepareServer, endpoint, closeServer };
}

describe('get-multi-metadata-keys', () => {

    const sTools = serverTools();

    beforeEach(sTools.prepareServer);
    afterEach(sTools.closeServer);

    it('check if endpoint `/users/v1/auth/:authToken/multi/metadata/:keys [GET]` exists', () => {
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

    it('fail when token is not provided', (done) => {
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
    it('return array of key-value pairs', (done) => {
        superagent
            .get(sTools.endpoint('/auth/valid-token/multi/metadata/username,email'))
            .end((err, res) => {
                expect(res?.status, 'response status').to.equal(200);
                expect(res?.body[0], 'respone body').to.have.property('key');
                expect(res?.body[0], 'respone body').to.have.property('value');
                done();
            });
    });

});


describe('post-multi-metadata-keys', () => {

    const sTools = serverTools();

    beforeEach(sTools.prepareServer);
    afterEach(sTools.closeServer);

    it('check if endpoint `/users/v1/auth/:authToken/multi/metadata [POST]` exists', () => {
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

    it('return unauthorized when token is not valid', (done) => {
        superagent
            .post(sTools.endpoint('/auth/00000/multi/metadata'))
            .send(dataForPost)
            .end(function (err, res) {
                expect(res?.status, 'response status').to.equal(401);
                done();
            });
    });
});


describe('get-multi-user-metadata-keys', () => {

    const sTools = serverTools();

    beforeEach(sTools.prepareServer);
    afterEach(sTools.closeServer);

    it('check if endpoint `/users/v1/multi/metadata/:userIds/:keys [GET]` exists', () => {
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

    it('return array of key-value-username pairs', (done) => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/username,name'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body[0], 'respone body').to.have.property('username');
                expect(res?.body[0], 'respone body').to.have.property('key');
                expect(res?.body[0], 'respone body').to.have.property('value');
                done();
            });
    });
    it('return array that matches the requested users+keys', (done) => {
        superagent
            .get(sTools.endpoint('/multi/metadata/alice,bob/username,name'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.body.length, 'respone body length').to.equal(4);
                done();
            });
    });

});