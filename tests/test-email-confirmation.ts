import fakeRestify from "./fake-restify";
import restify, { Server } from "restify";
import { expect } from 'chai';
import superagent from 'superagent';
import td, { DoubledObjectWithKey, TestDouble } from 'testdouble';
const { verify, matchers } = td;
const { contains } = matchers;
import userApis from '../src/users-api';
import { AuthdbClient } from "../src/authentication";
import fakeAuthdb from "./fake-authdb";
import { DirectoryClient } from "../src/directory-client";
import { UsermetaClient } from "../src/usermeta";
import { Backend, BackendInitializer, BackendOptions } from "../src/backend/directory";
import Logger from "bunyan";
import logMod from '../src/log';
import fakeUsermeta from './fake-usermeta';
import totp from "../src/email-confirmation/totp";
import { CONFIRMED_META_KEY } from "../src/email-confirmation/api";
import bunyan from 'bunyan';
import * as _ from 'lodash';
import mailer from '../src/mailer';

const PREFIX = "users/v1";

const TAGS = {
    "charies-tag": "charles",
};

const calledOnce = {
    times: 1,
    ignoreExtraArgs: true
};


const alice_publicAccount = {
    id: "alice",
    aliases: {
        name: "alice-name",
        tag: "alice-tag",
        email: 'alice@test.com'
    }
};


const bob_publicAccount = {
    id: "bob",
    aliases: {
        name: "bob-name",
        tag: "bob-tag"
    }
};

const data = {
    createAccount: {
        valid: {
            username: 'jeko',
            password: undefined,
            email: 'jeko@test.com'
        }
    }
}


const mailOptions = {
    host: 'bobmail.fovea.cc',
    port: '25',
    from: 'admin@ganomede.org',
    subject: 'default-subject',
    text: 'default-text',
    html: 'default-html'
};

const nodemailerTransportTD = function () {
    const transport: any = td.object('sendMail');
    td.when(transport.sendMail(td.matchers.anything()))
        .thenCallback(null, 'messageInfo');
    return transport;
};

const nodemailerTD = function ({ nodemailerTransport }) {
    const nodemailer = td.object(['createTransport']);
    td.when(nodemailer.createTransport(contains({
        host: mailOptions.host,
        port: mailOptions.port
    }))).thenReturn(nodemailerTransport);
    return nodemailer;
};

const transportOptions = ({ nodemailer, log }) => _.extend({}, { nodemailer, log }, mailOptions);

const mailerTest = function () {
    const callback = td.function('callback');
    const nodemailerTransport = nodemailerTransportTD();
    const nodemailer = nodemailerTD({ nodemailerTransport });
    const log = td.object(['debug', 'info', 'error']);
    const tb = bunyan.createLogger({ name: 'tbf' });
    td.when(log.debug(), { ignoreExtraArgs: true })
        .thenDo(tb.info.bind(tb));
    return _.extend({},
        { nodemailerTransport, nodemailer, callback },
        mailOptions);
};

class Test {

    directoryClient: DirectoryClient;
    log: Logger;
    localUsermetaClient: UsermetaClient;
    centralUsermetaClient: UsermetaClient;
    backend: TestDouble<Backend>// DoubledObjectWithKey<string>;
    backendInitializer: TestDouble<BackendInitializer>// DoubledObjectWithKey<string>;
    createBackend: (options: BackendOptions) => BackendInitializer;
    authdbClient: AuthdbClient;
    mailer: any;

    constructor() {

        process.env.MAILER_SEND_SUBJECT = '';
        process.env.MAILER_SEND_TEXT = '';
        process.env.MAILER_SEND_HTML = '';
        // Some mocks so we can initialize the `users` module.
        this.directoryClient = td.object<DirectoryClient>();

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
        this.log = td.object<Logger>();
        this.localUsermetaClient = fakeUsermeta.createClient();
        this.centralUsermetaClient = fakeUsermeta.createClient();
        this.backendInitializer = td.object<BackendInitializer>();
        this.backend = td.object<Backend>();
        this.createBackend = td.function('createBackend') as (options: BackendOptions) => BackendInitializer;

        td.when(
            this.createBackend(td.matchers.isA(Object)))
            .thenReturn(this.backendInitializer);
        td.when(
            this.backendInitializer.initialize(td.callback))
            .thenCallback(null, this.backend);
        this.authdbClient = fakeAuthdb.createClient();
        this.authdbClient.addAccount("valid-token", {
            username: "alice",
            email: 'alice@test.com'
        });
    }

    initialize(server, port, done) {

        const mtest = mailerTest();
        const transport = mailer.createTransport(transportOptions(mtest));
        this.mailer = {
            createTransport: function () {
                return _.extend({}, mtest, {
                    transport, sendMail: (options, cb) => {
                        mtest.nodemailerTransport.sendMail(options, mtest.callback);
                        //transport.sendMail(options, mtest.callback);
                        cb(null, '');
                    }
                });
            },
            mtest,
            transport
        };

        try {
            userApis.initialize((err) => {
                if (err) {
                    console.error("Failed to initialize usersApi", err);
                    return done(err);
                }
                userApis.addRoutes(PREFIX, server as unknown as restify.Server);
                server.listen(port, done);
            }, this);
        }
        catch (err) {
            done(err);
        }
    }
}

const serverTools = () => {
    let server: Server | null = null;

    let port = 31009;
    let test: Test = new Test();


    function prepareServer(done) {
        ++port;
        server = restify.createServer();
        server.use(restify.plugins.bodyParser());
        server.use(restify.plugins.queryParser());

        // test = new Test();
        test.initialize(server, port, (err) => {
            if (err) {
                console.error(err);
                if (port < 32000) // try all ports up to 32000...
                    prepareServer(done);
                else
                    done(err);
            }
            else {
                done();
            }
        });
    }

    function closeServer(done) {
        server?.close();
        done();
    }

    function endpoint(path: string): string {
        return `http://localhost:${server!.address().port}/${PREFIX}${path}`;
    }



    return { prepareServer, endpoint, closeServer, server, test };
}


describe('email-confirmation', () => {

    const sTools = serverTools();

    beforeEach(sTools.prepareServer);
    afterEach(sTools.closeServer);


    describe('Post confirm-email', () => {

        it('add routes to the restify server, with the given prefix', (done) => {
            const server = fakeRestify.createServer();
            userApis.addRoutes(PREFIX, server as unknown as restify.Server);
            expect(server.routes.post[`/${PREFIX}/auth/:authToken/confirm-email`], 'get /users/v1/auth/:authToken/confirm-email route').to.be.ok;
            done();
        });

        it('should respond and accept a valid token', (done) => {
            const accessCode = totp.generate(alice_publicAccount.aliases.email);
            superagent
                .post(sTools.endpoint('/auth/valid-token/confirm-email'))
                .send({ accessCode })
                .end((err, res) => {
                    expect(err, 'request error').to.be.null;
                    expect(res?.status, 'response status').to.equal(200);
                    expect(res?.body, 'response body').to.eql({ok:true, isValid:true});
                    done();
                });
        });
                    
        it('should reject an invalid token', (done) => {
            const accessCode = totp.generate(alice_publicAccount.aliases.email);
            superagent
                .post(sTools.endpoint('/auth/valid-token/confirm-email'))
                .send({ accessCode: 'this-is-not-a-valid-token' })
                .end((err, res) => {
                    expect(err, 'request error').to.be.null;
                    expect(res?.status, 'response status').to.equal(200);
                    expect(res?.body, 'response body').to.eql({ok:true, isValid:false});
                    done();
                });
        });

        it("requires a valid authToken", (done) => {
            const accessCode = totp.generate(alice_publicAccount.aliases.email);
            superagent
                .post(sTools.endpoint('/auth/not-valid-token/confirm-email'))
                .send({ accessCode })
                .end((err, res) => {
                    expect(err, 'request error').to.be.not.null;
                    expect(res?.status, 'response status').to.equal(401);
                    done();
                });
        });

        it('update usermeta with confirmation', (done) => {
            const accessCode = totp.generate(alice_publicAccount.aliases.email);

            superagent
                .post(sTools.endpoint('/auth/valid-token/confirm-email'))
                .send({ accessCode })
                .end((err, res) => {
                    expect(err, 'request error').to.be.null;
                    expect(res?.status, 'response status').to.equal(200);

                    sTools.test?.centralUsermetaClient.get({ username: 'alice' },
                        CONFIRMED_META_KEY, (err, reply) => {
                            expect(err, 'error client get').to.be.null;
                            expect(reply, 'confirmed on').to.be.not.null;
                            expect(typeof reply, 'confirmed on').to.be.equals('string');
                            expect(reply, 'confirmed on').to.be.not.equals('');
                            const obj = JSON.parse(reply as string);
                            expect(obj['alice@test.com'], 'confirmed on alice').to.be.a('Number');
                            done();
                        }
                    );
                });
        });


    });

    describe('Send TOTP on new email', () => {

        it('send confirmation on new account with POST /accounts', (done) => {

            const { backend } = sTools.test;
            const createAccountData = {
                id: data.createAccount.valid.username,
                username: data.createAccount.valid.username,
                email: data.createAccount.valid.email,
                password: data.createAccount.valid.password
            };
            td.when(backend.createAccount(
                td.matchers.contains(createAccountData),
                td.callback))
                .thenCallback(null, data.createAccount.valid);

            superagent
                .post(sTools.endpoint("/accounts"))
                .send(data.createAccount.valid)
                .end(function (err, res) {

                    expect(err, 'error create account').to.be.null;
                    expect(res?.status, 'response status').to.equal(200);

                    const { callback, nodemailerTransport } = sTools.test.mailer.mtest;
                    verify(nodemailerTransport.sendMail(
                        td.matchers.contains({
                            from: "admin@ganomede.org",
                            subject: "",
                            text: "",
                            html: "",
                            to: "jeko@test.com"
                        }),
                        callback), calledOnce
                    );

                    verify(callback(), calledOnce);

                    return done();
                });
        });

        it('send confirmation email change with POST /metadata/email', (done) => {
            superagent
                .post(sTools.endpoint('/auth/valid-token/metadata/email'))
                .send({ value: 'new-email@test.com' })
                .end(function (err, res) {

                    expect(err, 'error change account').to.be.null;
                    expect(res?.status, 'response status').to.equal(200);

                    const { callback, nodemailerTransport } = sTools.test.mailer.mtest;

                    verify(nodemailerTransport.sendMail(
                        contains({
                            from: "admin@ganomede.org",
                            subject: "",
                            text: "",
                            html: "",
                            to: "new-email@test.com"
                        }),
                        callback), calledOnce
                    );

                    verify(callback(), calledOnce);

                    done();
                });
        });

        it('does not send confirmation email when already confirmed before', (done) => {

            sTools.test?.centralUsermetaClient.set({ username: 'alice' },
                CONFIRMED_META_KEY, JSON.stringify({ 'new-email@test.com': +new Date() }), () => { });
            superagent
                .post(sTools.endpoint('/auth/valid-token/metadata/email'))
                .send({ value: 'new-email@test.com' })
                .end(function (err, res) {

                    expect(err, 'error change account').to.be.null;
                    expect(res?.status, 'response status').to.equal(200);

                    const { callback, nodemailerTransport } = sTools.test.mailer.mtest;

                    verify(nodemailerTransport.sendMail(td.matchers.anything(),
                        td.matchers.anything()), { times: 0 }
                    );

                    verify(callback(), { times: 0 });

                    done();
                });
        });

        it('does not send confirmation email if the email is not valid', (done) => {

            superagent
                .post(sTools.endpoint('/auth/valid-token/metadata/email'))
                .send({ value: 'new-emailtestcom' })
                .end(function (err, res) {

                    expect(err.status, 'error status').to.equal(400);
                    expect(res?.body?.code, 'response status').to.equal('InvalidContent');

                    const { callback, nodemailerTransport } = sTools.test.mailer.mtest;

                    verify(nodemailerTransport.sendMail(td.matchers.anything(),
                        td.matchers.anything()), { times: 0 }
                    );

                    verify(callback(), { times: 0 });

                    done();
                });
        });

        it('does not matter if other emails confirmation exists before.', (done) => {

            sTools.test?.centralUsermetaClient.set({ username: 'alice' },
                CONFIRMED_META_KEY, JSON.stringify({ 'before@test.com': +new Date() }), () => { });
            superagent
                .post(sTools.endpoint('/auth/valid-token/metadata/email'))
                .send({ value: 'new-email@test.com' })
                .end(function (err, res) {

                    expect(err, 'error change account').to.be.null;
                    expect(res?.status, 'response status').to.equal(200);

                    const { callback, nodemailerTransport } = sTools.test.mailer.mtest;

                    verify(nodemailerTransport.sendMail(td.matchers.anything(),
                        td.matchers.anything()), calledOnce
                    );

                    verify(callback(), calledOnce);

                    done();
                });
        });


    });

});