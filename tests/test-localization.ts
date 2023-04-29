import { expect } from "chai";
import { DocumentContent, GanomedeDataClient } from "../src/data-client";
import { UserLocale } from "../src/user-locale";
import { UsermetaClient } from "../src/usermeta";
import td from 'testdouble';
import { Localize, localizedTemplates } from "../src/localizedTemplates";


const mockBulkForUserResponse = (fakeTd: UsermetaClient, username: string, keys: string[], values: any[]) => {
    td.when(fakeTd.getBulkForUser({ username }, keys, td.callback))
        .thenCallback(null, keys.map((key, index) => { return { username, key, value: values[index] }; }));
};

const ALTERN_DOC = { body: 'alternative-body', subject: 'alternative-subject' };
const EN_DOC = { body: 'english-body', subject: 'english-subject' };
const FR_DOC = { body: 'french-body', subject: 'french-subject' };
const EMPTY_DOC = {};
const DOCUMENT_KEY = 'CONFIRMATION';

describe('Ganomede data client', () => {

    it('create a data client', () => {
        const dataClient: GanomedeDataClient | null = GanomedeDataClient.createClient({ ganomedeDataClient: {} });
        expect(dataClient).to.be.not.null;

        const dataClient2: GanomedeDataClient | null =
            GanomedeDataClient.createClient({
                ganomedeDataConfig: {
                    protocol: 0,
                    host: '',
                    port: 111
                }
            });
        expect(dataClient2).to.be.not.null;

        const dataClient3: GanomedeDataClient | null = GanomedeDataClient.createClient({});
        expect(dataClient3).to.be.null;

    });
});


describe('User Locale', () => {

    const mTest = (username: string, keys: string[], values: any[]) => {
        const metaClient = td.object<UsermetaClient>();
        mockBulkForUserResponse(metaClient, username, keys, values);
        const userLocale: UserLocale = new UserLocale(metaClient);

        return { metaClient, userLocale };
    };

    it('create a user local', () => {
        const userLocale: UserLocale | null = new UserLocale({} as UsermetaClient);
        expect(userLocale).to.be.not.null;
    });

    it('fetchs values from user meta-client', (done) => {

        const tests = mTest('alice', ['location', 'locale'], ['us', 'en']);
        tests.userLocale.fetch({ username: 'alice' }, (locale: string) => {

            expect(locale).to.be.eql('en');
            td.verify(tests.metaClient.getBulkForUser(td.matchers.contains({ username: 'alice' }),
                ['location', 'locale'], td.matchers.anything()
            ), { times: 1 });

            done();
        });
    });

    it('fetchs locale based on location if not found', (done) => {

        const tests = mTest('alice', ['location', 'locale'], ['France']);
        tests.userLocale.fetch({ username: 'alice' }, (locale: string) => {

            expect(locale).to.be.eql('fr');
            td.verify(tests.metaClient.getBulkForUser(td.matchers.contains({ username: 'alice' }),
                ['location', 'locale'], td.matchers.anything()
            ), { times: 1 });

            done();
        });
    });

    it('falls back to english if location and locale not found', (done) => {

        const tests = mTest('alice', ['location', 'locale'], []);
        tests.userLocale.fetch({ username: 'alice' }, (locale: string) => {

            expect(locale).to.be.eql('en');
            td.verify(tests.metaClient.getBulkForUser(td.matchers.contains({ username: 'alice' }),
                ['location', 'locale'], td.matchers.anything()
            ), { times: 1 });

            done();
        });
    });
});


describe('localization', () => {

    const mTest = (username: string, keys: string[], values: any[]) => {
        const metaClient = td.object<UsermetaClient>();
        const dataClient = td.object<GanomedeDataClient>();
        mockBulkForUserResponse(metaClient, username, keys, values);

        td.when(dataClient.get(td.matchers.contains({ username, docId: `${DOCUMENT_KEY}:fr` }), td.callback))
            .thenCallback(null, FR_DOC);
        td.when(dataClient.get(td.matchers.contains({ username, docId: `${DOCUMENT_KEY}:en` }), td.callback))
            .thenCallback(null, EN_DOC);

        const userLocale: UserLocale = new UserLocale(metaClient);

        const localize: Localize = localizedTemplates(userLocale, dataClient);

        return { metaClient, userLocale, dataClient, localize };
    };

    it('localize data based on user-locale', (done) => {

        const tests = mTest('alice', ['location', 'locale'], ['France', 'fr']);


        tests.localize(DOCUMENT_KEY, { username: 'alice' }, ALTERN_DOC, (content: DocumentContent) => {

            expect(content).to.be.eql(FR_DOC);
            td.verify(tests.metaClient.getBulkForUser(td.matchers.contains({ username: 'alice' }),
                ['location', 'locale'], td.matchers.anything()
            ), { times: 1 });

            td.verify(tests.dataClient.get(td.matchers.contains({ username: 'alice', docId: `${DOCUMENT_KEY}:fr` }), td.matchers.anything()
            ), { times: 1 });

            done();
        });
    });

    it('localize data based on user-location', (done) => {

        const tests = mTest('alice', ['location', 'locale'], ['XX']);


        tests.localize(DOCUMENT_KEY, { username: 'alice' }, ALTERN_DOC, (content: DocumentContent) => {

            expect(content).to.be.eql(EN_DOC);
            td.verify(tests.metaClient.getBulkForUser(td.matchers.contains({ username: 'alice' }),
                ['location', 'locale'], td.matchers.anything()
            ), { times: 1 });

            td.verify(tests.dataClient.get(td.matchers.contains({ username: 'alice', docId: `${DOCUMENT_KEY}:en` }), td.matchers.anything()
            ), { times: 1 });

            done();
        });
    });

    it('fallback to english if document not found and lang is not english', (done) => {

        const tests = mTest('alice', ['location', 'locale'], ['France', 'fr']);

        td.when(tests.dataClient.get(td.matchers.contains({ username: 'alice', docId: `${DOCUMENT_KEY}:fr` }), td.callback))
            .thenCallback(null, null);

        tests.localize(DOCUMENT_KEY, { username: 'alice' }, ALTERN_DOC, (content: DocumentContent) => {

            expect(content).to.be.eql(EN_DOC);
            td.verify(tests.metaClient.getBulkForUser(td.matchers.contains({ username: 'alice' }),
                ['location', 'locale'], td.matchers.anything()
            ), { times: 1 });

            td.verify(tests.dataClient.get(td.matchers.contains({ username: 'alice', docId: `${DOCUMENT_KEY}:fr` }), td.matchers.anything()
            ), { times: 1 });
            td.verify(tests.dataClient.get(td.matchers.contains({ username: 'alice', docId: `${DOCUMENT_KEY}:en` }), td.matchers.anything()
            ), { times: 1 });

            td.verify(tests.dataClient.get(td.matchers.contains({ username: 'alice' }), td.matchers.anything()
            ), { times: 2 });

            done();
        });
    });

    it('fallback to alternative if document not found and lang is english', (done) => {

        const tests = mTest('alice', ['location', 'locale'], ['XX']);

        td.when(tests.dataClient.get(td.matchers.contains({ username: 'alice', docId: `${DOCUMENT_KEY}:en` }), td.callback))
            .thenCallback(null, null);

        tests.localize(DOCUMENT_KEY, { username: 'alice' }, ALTERN_DOC, (content: DocumentContent) => {

            expect(content).to.be.eql(ALTERN_DOC);
            td.verify(tests.metaClient.getBulkForUser(td.matchers.contains({ username: 'alice' }),
                ['location', 'locale'], td.matchers.anything()
            ), { times: 1 });

            td.verify(tests.dataClient.get(td.matchers.contains({ username: 'alice', docId: `${DOCUMENT_KEY}:fr` }), td.matchers.anything()
            ), { times: 0 });
            td.verify(tests.dataClient.get(td.matchers.contains({ username: 'alice', docId: `${DOCUMENT_KEY}:en` }), td.matchers.anything()
            ), { times: 1 });

            td.verify(tests.dataClient.get(td.matchers.contains({ username: 'alice' }), td.matchers.anything()
            ), { times: 1 });

            done();
        });
    });
});