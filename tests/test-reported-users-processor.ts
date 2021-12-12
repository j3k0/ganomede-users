import Logger from 'bunyan';
import { ProcessReportedUsers, createReportedUsersProcessor, UserReports } from '../src/reported-users/events-processor';
import { expect } from 'chai';
import td from 'testdouble';
import { Bans } from "../src/bans";
import { Event } from '../src/event-sender';
import { REPORTED } from '../src/blocked-users/events';
import config from '../src/config';

let eventsProcessor: ProcessReportedUsers | null = null;
let bans: Bans | null;

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

const blockedEvent3: Event = {
    req_id: '2',
    type: REPORTED,
    data: {
        req_id: '2',
        username: 'user2',
        target: 'user1'
    },
    from: 'user2'
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

describe('reported-users-processor', () => {



    beforeEach(() => {
        const log = td.object(['info', 'warn', 'error']) as Logger;
        bans = td.object(Bans.prototype);
        eventsProcessor = createReportedUsersProcessor(log, bans);
    });

    afterEach(() => {
        eventsProcessor = bans = null;
    });

    it('count the numbers of repport per user', (done) => {
        td.when(bans!.getBulk(td.matchers.anything(), td.callback)).thenCallback(null, []);
        eventsProcessor!("1", [blockedEvent1, blockedEvent2], (error, results: UserReports[] | null) => {
            expect(error).to.be.equal(null);
            expect(results?.length).to.be.eql(1);
            expect(results![0].total).to.be.eql(2);
            done();
        });
    });

    // it('omit banned users from the results', (done) => {
    //     td.when(bans!.getBulk(td.matchers.anything(), td.callback)).thenCallback(null, { user1: { exists: true }, user2: {} });
    //     eventsProcessor!("1", [blockedEvent1, blockedEvent2], (error, results: UserReports[] | null) => {
    //         expect(error).to.be.equal(null);
    //         expect(results?.length).to.be.eql(1);
    //         done();
    //     });
    // });

    it('sort result by total of reports descending', (done) => {
        td.when(bans!.getBulk(td.matchers.anything(), td.callback)).thenCallback(null, {});
        eventsProcessor!("1", [blockedEvent1, blockedEvent2, blockedEvent3], (error, results: UserReports[] | null) => {
            expect(error).to.be.equal(null);
            expect(results?.length).to.be.eql(2);
            expect(results![0].total).to.be.greaterThan(results![1].total);
            done();
        });
    });

    it('return only users that are not banned', (done) => {
        td.when(bans!.getBulk({ usernames: ['user2', 'user1'], apiSecret: '1' }, td.callback))
            .thenCallback(null, { user2: { exists: true } });
        eventsProcessor!("1", [blockedEvent1, blockedEvent2, blockedEvent3], (error, results: UserReports[] | null) => {
            expect(error).to.be.equal(null);
            expect(results?.length).to.be.eql(1);
            expect(results).to.be.eql([{ target: 'user1', total: 1 }]);
            done();
        });
    });

    it('return only limited number of users as per the config', (done) => {
        td.when(bans!.getBulk(td.matchers.anything(), td.callback)).thenCallback(null, {});
        eventsProcessor!("1", blockedEventsArray, (error, results: UserReports[] | null) => {
            expect(error).to.be.equal(null);
            expect(results?.length).to.be.eql(config.reportedUsersApiConfig.maxReturnedUsers);
            done();
        });
    });

})