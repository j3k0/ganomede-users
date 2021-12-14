import fakeRestify from "./fake-restify";
import restify, { Server } from "restify";
import getBlocksApi, { createIndexerClient } from "../src/blocked-users/get-blocks-api";
import { expect } from 'chai';
import superagent from 'superagent';
import { EventWithTimeStamp, GetUserBlocks } from "../src/blocked-users/models.type";
import * as GanomedeEvents from 'ganomede-events';
import td from 'testdouble';
import { BLOCKED, CHANNEL, REPORTED, UNBLOCKED } from "../src/blocked-users/events";
import { blockedIndexerConfig } from "../src/config";

const PREFIX = "users/v1";
const USERNAME = "user1";

const BLOCKED_BY_INDEX_ID = blockedIndexerConfig.blockedByUsernameId;
const REPORTS_INDEX_ID = blockedIndexerConfig.blockedByTargetId;
const now = +Date.now();
const User2_Blocked_User1: EventWithTimeStamp = {
    timestamp: now,
    type: BLOCKED,
    from: "triominos/prod",
    data: {
        req_id: '1',
        username: "user2",
        target: USERNAME
    }
};

const User1_Blocked_User2: EventWithTimeStamp = {
    timestamp: now,
    type: BLOCKED,
    from: "triominos/prod",
    data: {
        req_id: '1',
        username: USERNAME,
        target: "user2"
    }
};
const User2_Reported_User1: EventWithTimeStamp = {
    timestamp: now,
    type: REPORTED,
    from: "triominos/prod",
    data: {
        req_id: '1',
        username: "user2",
        target: USERNAME
    }
};

const User2_UnBlocked_User1: EventWithTimeStamp = {
    timestamp: (+Date.now()) + 2,
    type: UNBLOCKED,
    from: "triominos/prod",
    data: {
        req_id: '1',
        username: "user2",
        target: USERNAME
    }
};


const User1_UnBlocked_User2: EventWithTimeStamp = {
    timestamp: (+Date.now()) + 2,
    type: UNBLOCKED,
    from: "triominos/prod",
    data: {
        req_id: '1',
        username: USERNAME,
        target: "user2"
    }
};
const User1_Reported_User2: EventWithTimeStamp = {
    timestamp: now,
    type: REPORTED,
    from: "triominos/prod",
    data: {
        req_id: '1',
        username: USERNAME,
        target: "user2"
    }
};

describe('get-blocks-api', () => {
    describe('addRoutes(prefix, server)', () => {
        it('add routes to the restify server, with the given prefix', () => {
            const server = fakeRestify.createServer();
            getBlocksApi.addRoutes(PREFIX, server as unknown as restify.Server);
            expect(server.routes.get[`/${PREFIX}/admin/blocks/:username`], 'get /admin/blocks/:username route').to.be.ok;
        });
    });
});

describe('GET /admin/blocks/:username', () => {

    let server: Server;
    let client: GanomedeEvents.IndexerClient | undefined;

    let port = 31009;
    function prepareServer(done) {
        server = restify.createServer();
        server.use(restify.plugins.bodyParser());
        server.use(restify.plugins.queryParser());

        client = td.object<GanomedeEvents.IndexerClient>();
        td.when(client.createIndex(td.matchers.anything(), td.matchers.anything(), td.matchers.anything(),
            td.callback)).thenCallback(null, "OK");
        td.when(client.getIndexEvents(td.matchers.anything(), td.matchers.anything(),
            td.callback)).thenCallback(null, null);

        getBlocksApi.addRoutes(PREFIX, server, client);
        server.listen(port++, done);
    }

    function closeServer(done) {
        server.close();
        client = undefined;
        done();
    }

    function endpoint(path: string): string {
        return `http://localhost:${server.address().port}/${PREFIX}${path}`;
    }

    function createStubsForGetIndexEvents() {
        td.when(client?.getIndexEvents(BLOCKED_BY_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User2_Blocked_User1] });
        td.when(client?.getIndexEvents(REPORTS_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User2_Reported_User1] });
    }

    function createStubsForGetIndexEventsWithUnblocked() {
        td.when(client?.getIndexEvents(BLOCKED_BY_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User2_Blocked_User1, User2_UnBlocked_User1] });
        td.when(client?.getIndexEvents(REPORTS_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User2_Reported_User1] });
    }

    function createStubsForGetIndexEventsForReports() {
        td.when(client?.getIndexEvents(BLOCKED_BY_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User2_Blocked_User1, User2_UnBlocked_User1] });
        td.when(client?.getIndexEvents(REPORTS_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User1_Reported_User2] });
    }

    function createStubsForGetIndexEventsForBlocks() {
        td.when(client?.getIndexEvents(BLOCKED_BY_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User1_Blocked_User2] });
        td.when(client?.getIndexEvents(REPORTS_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User1_Reported_User2] });
    }

    function createStubsForGetIndexEventsForBlocksWithUnblock() {
        td.when(client?.getIndexEvents(BLOCKED_BY_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User1_Blocked_User2, User1_UnBlocked_User2] });
        td.when(client?.getIndexEvents(REPORTS_INDEX_ID, td.matchers.anything(),
            td.callback)).thenCallback(null, { rows: [User1_Reported_User2] });
    }

    beforeEach(prepareServer);
    afterEach(closeServer);

    it('should respond', (done) => {
        superagent
            .get(endpoint('/admin/blocks/whatever?secret=' + process.env.API_SECRET))
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

    it('requires the api secret or fails with 403 (Forbidden)', (done) => {
        superagent
            .get(endpoint(`/admin/blocks/${USERNAME}`))
            .end((_err, res) => {
                expect(res?.status, 'response status').to.equal(403);
                done();
            });
    });

    it('requires a valid api secret or fails with 403 (Forbidden)', (done) => {
        superagent
            .get(endpoint(`/admin/blocks/${USERNAME}`))
            .query({ secret: 'invalid_secret' })
            .end((_err, res) => {
                expect(res?.status, 'response status').to.equal(403);
                done();
            });
    });

    describe('response.blockedBy', () => {
        it('is an array', (done) => {
            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blockedBy, 'response.blockedBy').to.be.an('array');
                    done();
                });
        });
        it('contains the list of other users blocked by the user', (done) => {

            createStubsForGetIndexEvents();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blockedBy[0].username, 'response.blockedBy[0].username').to.not.be.equal(USERNAME);
                    done();
                });
        });
        it('contains the username ("username" field)', (done) => {

            createStubsForGetIndexEvents();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blockedBy[0]).to.have.own.property('username');
                    done();
                });
        });
        it('contains the blocked date in the "on" field as a timestamp', (done) => {

            createStubsForGetIndexEvents();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blockedBy[0]).to.have.own.property('on');
                    expect((res?.body as GetUserBlocks).blockedBy[0].on).to.equal(now);
                    done();
                });
        });
        it('does not report a user as blocked if there is a subsequent unblock event', (done) => {

            createStubsForGetIndexEventsWithUnblocked();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blockedBy.length).to.equal(0);
                    done();
                });
        });
    });

    describe('response.reportedBy', () => {
        it('is an array', (done) => {
            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).reportedBy, 'response.reportedBy').to.be.an('array');
                    done();
                });
        });
        it('contains the list of other users reported by the user', (done) => {
            createStubsForGetIndexEvents();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).reportedBy[0].username, 'response.reportedBy[0].username').to.not.be.equal(USERNAME);
                    done();
                });
        });
        it('contains the username ("username" field)', (done) => {
            createStubsForGetIndexEvents();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).reportedBy[0]).to.have.own.property('username');
                    done();
                });
        });
        it('contains the reported date in the "on" field as a timestamp', (done) => {
            createStubsForGetIndexEvents();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).reportedBy[0]).to.have.own.property('on');
                    expect((res?.body as GetUserBlocks).reportedBy[0].on).to.equal(now);
                    done();
                });
        });
    });

    describe('response.reports', () => {
        it('is an array', (done) => {
            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).reports, 'response.reports').to.be.an('array');
                    done();
                });
        });
        it('contains the list of other users that reported the user', (done) => {
            createStubsForGetIndexEventsForReports();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).reports[0].username, 'response.reports[0].username').to.not.be.equal(USERNAME);
                    done();
                });
        });
        it('contains the username ("username" field)', (done) => {
            createStubsForGetIndexEventsForReports();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).reports[0]).to.have.own.property('username');
                    done();
                });
        });
        it('contains the reported date in the "on" field as a timestamp', (done) => {
            createStubsForGetIndexEventsForReports();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).reports[0]).to.have.own.property('on');
                    expect((res?.body as GetUserBlocks).reports[0].on).to.equal(now);
                    done();
                });
        });
    });

    describe('response.blocks', () => {
        it('is an array', (done) => {
            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blocks, 'response.blocks').to.be.an('array');
                    done();
                });
        });
        it('contains the list of other users that blocked the user', (done) => {
            createStubsForGetIndexEventsForBlocks();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blocks[0].username, 'response.blocks[0].username').to.not.be.equal(USERNAME);
                    done();
                });
        });
        it('contains the username ("username" field)', (done) => {
            createStubsForGetIndexEventsForBlocks();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blocks[0]).to.have.own.property('username');
                    done();
                });
        });
        it('contains the blocked date in the "on" field as a timestamp', (done) => {
            createStubsForGetIndexEventsForBlocks();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blocks[0]).to.have.own.property('on');
                    expect((res?.body as GetUserBlocks).blocks[0].on).to.equal(now);
                    done();
                });
        });
        it('does not report the user as blocked if there is a subsequent unblock event', (done) => {
            createStubsForGetIndexEventsForBlocksWithUnblock();

            superagent
                .get(endpoint(`/admin/blocks/${USERNAME}`))
                .query({ secret: process.env.API_SECRET })
                .end((_err, res) => {
                    expect((res?.body as GetUserBlocks).blocks.length).to.equal(0);
                    done();
                });
        });
    });

    it('will create a "blocks-by-username" index in ganomede-events', (done) => {
        const { createIndex } = createIndexerClient({ client });
        createIndex(BLOCKED_BY_INDEX_ID, CHANNEL, blockedIndexerConfig.blockedByUsernameField, (e, h) => {
            expect(e).to.be.equal(null);
            expect(h).to.be.equal("OK");
            done();
        });
    });
    it('will create a "blocks-by-target" index in ganomede-events', (done) => {
        const { createIndex } = createIndexerClient({ client });
        createIndex(REPORTS_INDEX_ID, CHANNEL, blockedIndexerConfig.blockedByTargetField, (e, h) => {
            expect(e).to.be.equal(null);
            expect(h).to.be.equal("OK");
            done();
        });
    });
});