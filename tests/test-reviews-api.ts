import restify, { Server } from "restify";
import td from 'testdouble';

import fakeRestify from "./fake-restify";
import { expect } from 'chai';
import superagent from 'superagent';
import { addRoutes } from '../src/blocked-users/reviews-api';
import { EventSender } from "../src/event-sender";

const PREFIX = "users/v1";
const dataForPost = {
    username: 'user1'
};

const sendEvent: EventSender = td.function('sendEvent') as EventSender;

describe('post-user-reviews', () => {
    describe('addRoutes(prefix, server)', () => {
        it('add routes to the restify server, with the given prefix', () => {
            const server = fakeRestify.createServer();
            addRoutes(PREFIX, server as unknown as restify.Server, sendEvent);
            expect(server.routes.post[`/${PREFIX}/admin/user-reviews`], 'post /admin/user-reviews route').to.be.ok;
        });
    });
});



describe('POST /admin/user-reviews', () => {

    let server: Server;
    let sendEvent: EventSender;

    let port = 31009;
    function prepareServer(done) {
        server = restify.createServer();
        server.use(restify.plugins.bodyParser());
        server.use(restify.plugins.queryParser());
        sendEvent = td.function('sendEvent') as EventSender;

        addRoutes(PREFIX, server, sendEvent);
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
            .post(endpoint('/admin/user-reviews?secret=' + process.env.API_SECRET))
            .send(dataForPost)
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                expect(res?.status, 'response status').to.equal(200);
                done();
            });
    });

    it('requires the api secret or fails with 403 (Forbidden)', (done) => {
        superagent
            .post(endpoint(`/admin/user-reviews`))
            .send(dataForPost)
            .end((_err, res) => {
                expect(res?.status, 'response status').to.equal(403);
                done();
            });
    });

    it('requires a username to work or fails with 400 (Bad Request)', (done) => {
        superagent
            .post(endpoint('/admin/user-reviews?secret=' + process.env.API_SECRET))
            .send({})
            .end((_err, res) => {
                expect(res?.status, 'response status').to.equal(400);
                done();
            });
    });

    it('requires a username to work or fails with 400 (Bad Request)', (done) => {
        superagent
            .post(endpoint('/admin/user-reviews?secret=' + process.env.API_SECRET))
            .send({})
            .end((_err, res) => {
                expect(res?.status, 'response status').to.equal(400);
                done();
            });
    });

    it('send an event with type USER_REVIEW', (done) => {
        superagent
            .post(endpoint('/admin/user-reviews?secret=' + process.env.API_SECRET))
            .send(dataForPost)
            .end((err, res) => {
                expect(err, 'request error').to.be.null;
                td.verify(sendEvent("users/v1/blocked-users", "USER_REVIEW", {
                    req_id: td.matchers.isA(String),
                    // type: "BLOCKED",
                    username: "$$",
                    target: "user1",
                    action: "CLEAN"
                    // blocked: final.split(',')
                }));
                done();
            });
    });


});