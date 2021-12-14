import fakeRestify, { Server } from "./fake-restify";
import restify from 'restify';
import reportedApi from '../src/reported-users/api';
import assert from "assert";
import { expect } from 'chai';
import td from 'testdouble';
import { REPORTED } from "../src/blocked-users/events";
import { createReportedUsersProcessor } from "../src/reported-users/events-processor";
import Logger from "bunyan";
import { Bans } from "../src/bans";
import { Event } from "../src/event-sender";
import config from '../src/config';

let server: Server | null;
let latestEvents;


const blockedEvent1: Event = {
    req_id: '1',
    type: REPORTED,
    data: {
        req_id: '1',
        username: 'user1',
        target: 'user2'
    },
    from: 'user1'
};

const blockedEvent2: Event = {
    req_id: '2',
    type: REPORTED,
    data: {
        req_id: '2',
        username: 'user3',
        target: 'user2'
    },
    from: 'user3'
};

const blockedEventsArray: Event[] = Array.from(
    { length: 10000 },
    (v, i) => i).map((i) => {
        let userId1 = Math.random() * (10000 - 0) + 0;
        let userId2 = Math.random() * (10000 - 0) + 0;
        return {
            req_id: i.toString(),
            type: REPORTED,
            data: {
                req_id: i.toString(),
                username: 'user' + userId1,
                target: 'user' + userId2
            },
            from: 'user' + userId1
        }
    });


describe("reported-users-api", () => {

    beforeEach(() => {
        server = fakeRestify.createServer();
        latestEvents = td.function('latestEvent');
        const log = td.object(['info', 'warn', 'error']) as Logger;
        const bans = td.object(Bans.prototype);
        td.when(bans.getBulk(td.matchers.anything(), td.callback)).thenCallback(null, {});
        reportedApi.addRoutes("users/v1", latestEvents, createReportedUsersProcessor(log, bans), server as unknown as restify.Server)
    });

    afterEach(() => {
        server = latestEvents = null;
    });

    it("test if the endpoint 'GET /users/v1/reported-users' exists", () => {
        assert.ok(server!.routes.get["/users/v1/reported-users"]);
    });

    it("fails when secret is not provided", (done) => {

        server?.request("get", '/users/v1/reported-users', { params: {} }, (res) => {
            expect(res?.body).to.be.instanceof(Error);
            expect(res?.status).to.equal(500);
            done();
        });
    });

    it("expect the response of the endpoint to be an array", (done) => {

        td.when(latestEvents!(td.matchers.anything(), td.matchers.anything(), td.callback)).
            thenCallback(null, [{ target: 'test', total: 10 }]);

        server?.request("get", '/users/v1/reported-users', { params: { secret: '1' } }, (res) => {
            expect(res?.body).to.be.an('array');
            expect(res?.status).to.equal(200);
            done();
        });
    });

    it("call the latest events from the ganomede-events", (done) => {

        td.when(latestEvents!(td.matchers.anything(), td.matchers.anything(), td.callback)).
            thenCallback(null, [blockedEvent1, blockedEvent2]);

        server?.request("get", '/users/v1/reported-users', { params: { secret: '1' } }, (res) => {
            expect(res?.body).to.be.eql([{ target: 'user2', total: 2 }]);
            expect(res?.status).to.equal(200);
            done();
        });
    });

    it("retreive 10,000 events from the endpoint as per the limit", (done) => {
        td.when(latestEvents!(td.matchers.anything(), 10000, td.callback)).
            thenCallback(null, blockedEventsArray);

        server?.request("get", '/users/v1/reported-users', { params: { secret: '1' } }, (res) => {
            expect(res?.body.length).to.be.eql(config.reportedUsersApiConfig.maxReturnedUsers);
            expect(res?.status).to.equal(200);
            done();
        });
    });

});