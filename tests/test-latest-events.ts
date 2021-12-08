import { expect } from "chai";
import { createLatestEventsClient, LatestEvents } from "../src/latest-events";
import * as GanomedeEvents from 'ganomede-events';

import td from 'testdouble';
import { Event } from "../src/event-sender";
import { REPORTED } from "../src/blocked-users/events";


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
    { length: 50 },
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

const CHANNEL: string = 'Some-Channel';
let client: GanomedeEvents.Client | undefined;

describe('latest-events', () => {

    beforeEach(() => {
        client = td.object<GanomedeEvents.Client>();
    });

    afterEach(() => {
        client = undefined;
    })

    it('create a EventLatest method', (done) => {
        let latestEvent = createLatestEventsClient({ client });
        td.when(client?.getLatestEvents(td.matchers.anything(), td.matchers.anything(), td.callback)).
            thenCallback(null, []);

        expect(typeof latestEvent).to.be.equals('function');
        expect(latestEvent.name).to.be.equal('latest');

        latestEvent(CHANNEL, 100, (err: Error | null, data: any) => {
            expect(data).to.be.an('array');
            done();
        });
    });

    it('fails when channel is not provided', (done) => {
        let latestEvent = createLatestEventsClient({ client });
        td.when(client?.getLatestEvents(td.matchers.anything(), td.matchers.anything(), td.callback)).
            thenCallback(null, []);

        expect(typeof latestEvent).to.be.equals('function');
        expect(latestEvent.name).to.be.equal('latest');

        latestEvent('', 100, (err: Error | null, data: any) => {
            expect(err).to.be.instanceof(Error);
            done();
        });
    });

    it('return an array from api', (done) => {
        let latestEvent = createLatestEventsClient({ client });
        td.when(client?.getLatestEvents(td.matchers.anything(), td.matchers.anything(), td.callback)).
            thenCallback(null, [blockedEvent1, blockedEvent2]);

        latestEvent(CHANNEL, 100, (err: Error | null, data: any) => {
            expect(err).to.be.equal(null);
            expect(data).to.be.an('array');
            expect(data).to.be.eql([blockedEvent1, blockedEvent2]);
            done();
        });
    });

    it('return a limited number of events', (done) => {
        let latestEvent = createLatestEventsClient({ client });
        td.when(client?.getLatestEvents(td.matchers.anything(), td.matchers.anything(), td.callback)).
            thenCallback(null, blockedEventsArray);

        latestEvent(CHANNEL, 50, (err: Error | null, data: any) => {
            expect(err).to.be.equal(null);
            expect(data).to.be.an('array');
            expect(data.length).to.be.equal(50);
            done();
        });
    });


});
