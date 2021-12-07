import fakeRestify from "./fake-restify";
import restify, { Server } from "restify";
import getBlocksApi from "../src/blocked-users/get-blocks-api";
import { expect } from 'chai';
import superagent from 'superagent';

const PREFIX = "users/v1";

describe('get-blocks-api', () => {
    describe('addRoutes(prefix, server)', () => {
        it('add routes to the restify server, with the given prefix', () => {
            const server = fakeRestify.createServer();
            getBlocksApi.addRoutes(PREFIX, server as unknown as restify.Server);
            expect(server.routes.get[`${PREFIX}/admin/blocks/:username`], 'get /admin/blocks/:username route').to.be.ok;
        });
    });
});

describe('GET /admin/blocks/:username', () => {

    let server: Server;

    let port = 31009;
    function prepareServer(done) {
        server = restify.createServer();
        getBlocksApi.addRoutes(PREFIX, server);
        server.listen(port++, done);
    }

    function closeServer(done) {
        server.close();
        done();
    }

    function endpoint(path: string): string {
        return `http://localhost:${server.address().port}/${PREFIX}${path}`;
    }

    beforeEach(prepareServer);
    afterEach(closeServer);

    it('should respond', (done) => {
        superagent
            .get(endpoint('/admin/blocks/whatever'))
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.status, 'response status').to.equal(200);
                done();
            });
    });

    it('requires a username to work or fails with 400 (Bad Request)', (done) => {
        superagent
        .get(endpoint('/admin/blocks/'))
        .end((_err, res) => {
            expect(res?.status, 'response status').to.equal(400);
            done();
        });
    });

    it('requires the api secret or fails with 403 (Forbidden)');

    describe('response.blockedBy', () => {
        it('is an array');
        it('contains the list of other users blocked by the user');
        it('contains the username ("username" field)');
        it('contains the blocked date in the "on" field as a timestamp');
        it('does not report a user as blocked if there is a subsequent unblock event');
    });

    describe('response.reportedBy', () => {
        it('is an array');
        it('contains the list of other users reported by the user');
        it('contains the username ("username" field)');
        it('contains the reported date in the "on" field as a timestamp');
    });

    describe('response.reports', () => {
        it('is an array');
        it('contains the list of other users that reported the user');
        it('contains the username ("username" field)');
        it('contains the reported date in the "on" field as a timestamp');
    });

    describe('response.blocks', () => {
        it('is an array');
        it('contains the list of other users that blocked the user');
        it('contains the username ("username" field)');
        it('contains the blocked date in the "on" field as a timestamp');
        it('does not report the user as blocked if there is a subsequent unblock event');
    });

    it('will create a "blocks-by-username" index in ganomede-events');
    it('will create a "blocks-by-target" index in ganomede-events');
});