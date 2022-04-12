import log from "./log";
import { UsermetaClient, UsermetaClientSingleOptions, UsernameKeyValue } from "./usermeta";

const formatLocale = locale => locale.slice(0, 2).toLowerCase();

const localeFromLocation = function (location?: string): string {
    if (!location) {
        return 'en';
    }
    if (location.indexOf('France') >= 0) {
        return 'fr';
    }
    if (location.indexOf('Germany') >= 0) {
        return 'de';
    }
    if (location.indexOf('Netherlands') >= 0) {
        return 'nl';
    }
    if (location.indexOf('Spain') >= 0) {
        return 'es';
    }
    if (location.indexOf('Portugal') >= 0) {
        return 'pt';
    }
    if (location.indexOf('Poland') >= 0) {
        return 'pl';
    }
    return 'en';
};

export type FetchLocalCallback = (local: string) => void;

export class UserLocale {

    metaClient: UsermetaClient;

    constructor(metaClient: UsermetaClient) {
        this.metaClient = metaClient;
    }

    fetch(params: UsermetaClientSingleOptions, callback: FetchLocalCallback) {

        this.metaClient.getBulkForUser(params, ['location', 'locale'],
            (err: Error | null, reply?: UsernameKeyValue[]) => {
                if (err) {
                    log.warn(err, { userId: params.username });
                    return callback('en');
                }
                const locale = reply?.find(x => x.key == 'locale');
                if (locale) {
                    const formattedLocal = formatLocale(locale.value);
                    log.debug(`user locale [fetched]: ${params.username} = "${formattedLocal}"`);
                    return callback(formattedLocal);
                }
                const location = reply?.find(x => x.key == 'location');
                if (location) {
                    const formattedLocal = localeFromLocation(location.value as string);
                    log.debug(`user locale [fetched]: ${params.username} = "${formattedLocal}" from location`);
                    return callback(formattedLocal);
                }
                callback('en');
            }
        );
    }
}