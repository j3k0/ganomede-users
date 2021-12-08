/*
* method responsible for processing the latest events 
* 1- group all events by users and do calculate the total of reports per user.
* 2- Sort the groups by the total desc.
* 3- Execute async parallel over all the users, check if each user is banned.
* 4- the end results will be an array (configured length) of users not banned in a desc order of their total
*/
import { Event } from "../event-sender";
import { BlockedUserEvent, REPORTED } from "../blocked-users/events";
import config from '../config';
import { BanInfo, Bans, MultiBanInfo } from "../bans";
import Logger from "bunyan";
import async from 'async';

export type UserReports = { target: string, total: number };

export type ProcessReportedUsers = (secret: string, events: Event[], cb: (error: Error | null, results: UserReports[] | null) => void) => void;

export const processReportedUsers = (log: Logger, bans: Bans) => (secret: string, events: Event[], cb: (error: Error | null, results: UserReports[] | null) => void) => {
    //build a key-value pair of user, total.
    //filter only reported events.
    //sum for each user the number of reports.
    let groupedUserReported: { [key: string]: number } = {};
    for (let i = 0, len = events.length; i < len; i++) {
        let event = events[i];
        if (event.type === REPORTED && event.data !== null) {
            let eventData: BlockedUserEvent = event.data as BlockedUserEvent;
            groupedUserReported[eventData.target] = (groupedUserReported[eventData.target] || 0) + 1;
        }
    }
    // or we do this
    // groupedUserReported = events.filter((event) => event.type === REPORTED)
    //     .map((event) => event.data as BlockedUserEvent)
    //     .reduce((result, currentValue: BlockedUserEvent) => {
    //         result[currentValue.target] = (result[currentValue.target] || 0) + 1;
    //         return result;
    //     }, {});

    //mapping the object to array of { target: string, total: number } for easy sorting.
    var reportedUsersArray: UserReports[] = Object.keys(groupedUserReported).map((key) => { return { target: key, total: groupedUserReported[key] }; });

    //sorting the array descending by the total reports.
    //we have now a sorted array [{username, totalReports}]
    reportedUsersArray = reportedUsersArray.sort((a, b) => b.total - a.total);

    //return only a number of reported users as per the config.
    let totalItemsTobeReturned = config.latestEventConfig.processTop;

    //check ban for a user, and callback the user in case only its not banned, else callback null.
    const checkBanAndCallbackUsers = (users: UserReports[], callback: (e: Error | null, notBannedUser?: UserReports[]) => void) => {
        //calling bans api to get status of a user.
        let usernames: string[] = users.map((user) => user.target);
        bans.getBulk({ usernames, apiSecret: secret }, (err: Error | null, bans?: MultiBanInfo) => {
            if (err) {
                log.error('checkBan() failed', { err, usernames: usernames });
                return callback(err);
            }

            if (bans === undefined) {
                log.error('checkBan() failed, bans is undefined', { err, usernames: usernames });
                return callback(new Error('bans object is undefined'));
            }
            //for each user-report we check if not banned, then callback the user object
            let results: UserReports[] = [];
            users.forEach(userReport => {
                let ban = bans[userReport.target];
                if (ban !== null && !ban?.exists) {
                    results.push(userReport);
                }
            });

            return callback(null, results);
        });
    };

    //split array into equal chunks to call bans.getBulk for better performance.
    const perChunk = 15;
    const chunkedReportedUsers: UserReports[][] = reportedUsersArray.reduce((all: UserReports[][], one: UserReports, i) => {
        const ch = Math.floor(i / perChunk);
        all[ch] = ([] as UserReports[]).concat((all[ch] || []), one);
        return all
    }, [])

    //prepare tasks to  be runned in parallel
    //each task will execute the ban check method, and callback the user.
    let tasks: any[] = [];
    chunkedReportedUsers.forEach((users) => {
        tasks.push(cb1 => checkBanAndCallbackUsers(users, cb1));
    });

    //doing parallel tasks
    async.parallel(tasks, (err, data) => {
        if (err) {
            cb(err, null);
        }
        else {
            //make the 2 levels array to 1 level => [[], [], []] => []
            let oneLevelArrayUserReports: UserReports[] = (data as UserReports[][])?.flat();
            //filter data items that are not null
            let results = (oneLevelArrayUserReports?.filter((u) => u !== null)) as UserReports[];
            //re-sort data items as per their total desc
            results = results.sort((a, b) => b.total - a.total);
            //get the first N elements from the array.
            results = results.slice(0, totalItemsTobeReturned);
            cb(null, results);
        }
    });
};


