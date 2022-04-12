import { DocumentContent, GanomedeDataClient } from "./data-client";
import log from "./log";
import { UserLocale } from "./user-locale";
import { UsermetaClientSingleOptions } from "./usermeta";

export type TranslationCallback = (content: DocumentContent) => void;
export type Translate = (paramCode: string, userParams: UsermetaClientSingleOptions, alternative: DocumentContent, callback: TranslationCallback) => void;

export const translation = (userLocale: UserLocale, dataClient: GanomedeDataClient): Translate => {

    return (paramCode: string, userParams: UsermetaClientSingleOptions, alternative: DocumentContent, callback: TranslationCallback) => {

        userLocale.fetch(userParams, (locale: string) => {
            dataClient.get({ docId: `${paramCode}:${locale}`, ...userParams }, (err: Error | null, document?: DocumentContent) => {
                if (err) {
                    log.warn(err, `Failed to fetch docId from data, code=${paramCode}`);
                    return callback(alternative);
                }
                if (!document) {
                    log.warn(err, `document not found in data, code=${paramCode}`);
                    return callback(alternative);
                }
                callback(document);
            });
        })
    };
};