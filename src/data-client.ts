import { jsonOptions, log, UsermetaClientBaseOptions } from "./usermeta";
import urllib from 'url';
import { HttpError } from "restify-errors";
import { Request, Response } from "restify";
import restifyClients from "restify-clients";
import { jsonClientRetry } from "./json-client-retry";
import helpers from "ganomede-helpers";
const serviceConfig = helpers.links.ServiceEnv.config;

export type DocumentContent = Record<string, string>;
export type GetDataCallback = (err: Error | null, document?: DocumentContent) => void;

export interface GanomedeDataParams extends UsermetaClientBaseOptions {
    docId: string;
}

export class GanomedeDataClient {

    jsonClient: any; // restify-clients.JsonClient
    type: string;

    constructor(jsonClient) {
        // super();
        this.jsonClient = jsonClient;
        this.type = "GanomedeDataClient";
    }

    prepareGet(params: GanomedeDataParams) {
        const url = this.jsonClient.url;
        const options = {
            ...jsonOptions({
                path: `/docs/${params.docId}`,
                req_id: params.req_id
            }, (subPath) => {
                return this.jsonClient.url.path + subPath;
            }),
            log: log.child({ req_id: params.req_id, url })
        };
        return { params, url, options };
    }

    get(pparams: GanomedeDataParams, cb: GetDataCallback) {

        const { params, url, options } = this.prepareGet(pparams);

        jsonClientRetry(this.jsonClient).get(
            options,
            (err: HttpError | null, _req: Request, _res: Response, body?: object | null) => {
                if (err) {
                    log.error({ err, url, options, body, req_id: params.req_id }, "GanomedeDataClient.get failed");
                    return cb(err);
                }
                const document = body ? body : {};
                cb(err, document as DocumentContent);
            }
        );
    }

    static createClient(options): GanomedeDataClient | null {
        const pathName = 'data/v1';

        if (options.ganomedeDataClient)
            return new GanomedeDataClient(options.ganomedeDataClient);

        if (options.ganomedeDataConfig)
            return new GanomedeDataClient(restifyClients.createJsonClient({
                url: urllib.format({
                    protocol: options.ganomedeDataConfig.protocol || 'http',
                    hostname: options.ganomedeDataConfig.host,
                    port: options.ganomedeDataConfig.port,
                    pathname: options.ganomedeDataConfig.pathname || pathName
                })
            }));

        const ganomedeEnv = 'GANOMEDE_DATA';
        const ganomedeConfig = serviceConfig(ganomedeEnv, 8000);
        if (!ganomedeConfig.exists) {
            log.warn(`cant create data client, no ${ganomedeEnv} config`);
            return null;
        }

        log.info({ ganomedeConfig }, `data`);

        return new GanomedeDataClient(restifyClients.createJsonClient({
            url: urllib.format({
                protocol: ganomedeConfig.protocol || 'http',
                hostname: ganomedeConfig.host,
                port: ganomedeConfig.port,
                pathname: ganomedeConfig.pathname || pathName
            })
        }));
    }
}

export const DataKeys = {
    emailConfirmation: 'EMAIL_CONFIRMATION_TEMPLATE',
    resetPassword: 'EMAIL_RESET_PASSWORD_TEMPLATE'
}