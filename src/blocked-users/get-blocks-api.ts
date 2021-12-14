import { Next, Request, Response, Server } from "restify";
import restifyErrors from "restify-errors";
import config, { blockedIndexerConfig } from '../config';
import * as GanomedeEvents from 'ganomede-events';
import { BlockedUserEvent, CHANNEL, BLOCKED, REPORTED, UNBLOCKED } from "./events";
const { IndexerClient } = GanomedeEvents;
import async from "async";
import { CreateIndexerClientOptions, CreateIndexRequest, EventWithTimeStamp, GetIndexEventsRequest, GetUserBlocks, UserBlock } from "./models.type";

/**
 * 
 * Method that will create an indexer client from ganomede-events,
 * this one will return 2 functions to be used for creating index, and for get events per index,
 * @returns {createIndex: CreateIndexRequest, getIndexEvents: GetIndexEventsRequest}
 */
export const createIndexerClient = ({
    secret = config.secret,
    protocol = config.events.protocol,
    hostname = config.events.host,
    port = config.events.port,
    client = undefined
}: CreateIndexerClientOptions = {}) => {

    if (client === undefined)
        client = new IndexerClient({
            secret,
            protocol,
            hostname,
            port
        });

    const createIndex: CreateIndexRequest = (id: string, channel: string, field: string, callback: (e: Error, h: any) => void) => {
        client?.createIndex(id, channel, field, callback);
    };

    const getIndexEvents: GetIndexEventsRequest = (indexId: string, indexValue: string, callback: (err: Error, result: GanomedeEvents.GetIndexEventsResult) => void) => {
        client?.getIndexEvents(indexId, indexValue, callback);
    };

    return { createIndex, getIndexEvents };
};

const getBlocksApis = (createIndexRequest: CreateIndexRequest,
    getIndexEventsRequest: GetIndexEventsRequest) => (req: Request, res: Response, next: Next) => {

        //checking username, cause its mandatory
        const { username } = req.params;
        if (username === null || username === undefined || username === '') {
            return next(new restifyErrors.InvalidContentError("Username is not provided"));
        }

        //checking secret, cause its mandatory
        const { secret } = req.query;
        if (secret === null || secret === undefined || secret === '' || secret !== process.env.API_SECRET) {
            return next(new restifyErrors.ForbiddenError("Secret is not provided"));
        }

        //prepare array for the index creation
        //we have 2 index to create.
        //index for blocked by users
        //index for the blocked target users.
        const indexCreation = [
            { id: blockedIndexerConfig.blockedByUsernameId, field: blockedIndexerConfig.blockedByUsernameField },
            { id: blockedIndexerConfig.blockedByTargetId, field: blockedIndexerConfig.blockedByTargetField }
        ];
        let indexCreationtasks: any[] = [];
        indexCreation.forEach((item) => {
            indexCreationtasks.push((cb2: (e: Error | null, h: any) => void) => createIndexRequest(item.id, CHANNEL, item.field, (e2, h2) => {
                if (e2 && e2.message === 'Key already exists')
                    return cb2(null, "OK");
                cb2(e2, h2);
            }));
        });

        //prepare get events from each index
        //2 index to get the events from.
        //get the list of events with data.username = 'username'
        //get the list of events with data.target = 'username'
        let getEventsFromIndexTasks: any[] = [];
        indexCreation.forEach((item) => {
            getEventsFromIndexTasks.push((cb2: (err: Error | null, result: EventWithTimeStamp[]) => void) => getIndexEventsRequest(item.id, username, (err, result) => {
                cb2(err, result ? result.rows as EventWithTimeStamp[] : []);
            }));
        });

        //process the events returned by both getEventsFromIndexTasks for each index.
        const processEvents = (events: EventWithTimeStamp[]): GetUserBlocks => {
            const filterEvents = (type: string, field: string) => {
                return events.filter((x) => x.type === type && (x.data as BlockedUserEvent)[field] === username)
                    .sort((a, b) => a.timestamp - b.timestamp);
            };
            let reportedBy = filterEvents(REPORTED, 'target');
            let reports = filterEvents(REPORTED, 'username');
            let blockedBy = filterEvents(BLOCKED, 'target');
            let blocks = filterEvents(BLOCKED, 'username');
            let unblockedBy = filterEvents(UNBLOCKED, 'target');
            let unblocks = filterEvents(UNBLOCKED, 'username');


            //loop over the blocked-by list and exclude if the user is got unblock 
            //by the same one who blocked him
            let blockedByUsers: UserBlock[] = [];
            for (let i = 0, len = blockedBy.length; i < len; i++) {
                let blocked = blockedBy[i];
                if (unblockedBy.filter((x) =>
                    x.timestamp > blocked.timestamp &&
                    (x.data as BlockedUserEvent).username === (blocked.data as BlockedUserEvent).username
                ).length === 0) {
                    blockedByUsers.push({ username: (blocked.data as BlockedUserEvent).username, on: blocked.timestamp });
                }
            }

            //loop over the blocks list and exclude if the user has unblock the same user
            let blocksList: UserBlock[] = [];
            for (let i = 0, len = blocks.length; i < len; i++) {
                let blocked = blocks[i];
                if (unblocks.filter((x) =>
                    x.timestamp > blocked.timestamp &&
                    (x.data as BlockedUserEvent).target === (blocked.data as BlockedUserEvent).target
                ).length === 0) {
                    blocksList.push({ username: (blocked.data as BlockedUserEvent).target, on: blocked.timestamp });
                }
            }
            //prepare the last result
            let result: GetUserBlocks = {
                blockedBy: blockedByUsers,
                reportedBy: reportedBy.map((item) => { return { username: (item.data as BlockedUserEvent).username, on: item.timestamp } }),
                reports: reports.map((item) => { return { username: (item.data as BlockedUserEvent).target, on: item.timestamp } }),
                blocks: blocksList
            };

            return result;
        };

        //execution of the get events in parallel
        //it will be executed after creating index (parallel) requests are done.
        const executeParallelGetEvents = () => {
            async.parallel(getEventsFromIndexTasks, (err, data) => {
                if (err) {
                    return next(new restifyErrors.InternalServerError("Get Events from Index failed"));
                }
                let results: EventWithTimeStamp[] = (data as any[])?.flat().filter((x)=> x!== null);
                let getUserBlocks = processEvents(results);
                res.send(getUserBlocks);
                next();
            });
        };

        //parallel the create index - requests.
        async.parallel(indexCreationtasks, (err, data) => {
            if (err) {
                return next(new restifyErrors.InternalServerError("Creating index failed"));
            }
            //create index requests are done, so now lets get the events for each index.
            executeParallelGetEvents();
        });
    };

export function addRoutes(prefix: string, server: Server, indexerClient?: GanomedeEvents.IndexerClient): void {

    const { createIndex, getIndexEvents } = createIndexerClient({ client: indexerClient });

    server.get(`/${prefix}/admin/blocks/:username`, getBlocksApis(createIndex, getIndexEvents));
}

export default { addRoutes };