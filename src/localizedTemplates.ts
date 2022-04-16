import { DocumentContent, GanomedeDataClient } from "./data-client";
import log from "./log";
import { UserLocale } from "./user-locale";
import { UsermetaClientSingleOptions } from "./usermeta";

export type LocalizationCallback = (content: DocumentContent) => void;
export type Localize = (paramCode: string, userParams: UsermetaClientSingleOptions, alternative: DocumentContent, callback: LocalizationCallback) => void;

export const localizedTemplates = (userLocale: UserLocale, dataClient: GanomedeDataClient): Localize => {

    return (paramCode: string, userParams: UsermetaClientSingleOptions, alternative: DocumentContent, callback: LocalizationCallback) => {

        userLocale.fetch(userParams, (locale: string) => {

            const getContentDocument = (codeLocal: string) => {
                dataClient.get({ docId: `${paramCode}:${codeLocal}`, ...userParams }, (err: Error | null, document?: DocumentContent) => {
                    if (err) {
                        log.warn(err, `Failed to fetch docId from data, code=${paramCode}`);
                        if (codeLocal !== 'en') {
                            return getContentDocument('en');
                        }
                        return callback(alternative);
                    }
                    if (!document) {
                        log.warn(err, `document not found in data, code=${paramCode}`);
                        if (codeLocal !== 'en') {
                            return getContentDocument('en');
                        }
                        return callback(alternative);
                    }
                    callback(document);
                });
            }

            getContentDocument(locale);
        })
    };
};