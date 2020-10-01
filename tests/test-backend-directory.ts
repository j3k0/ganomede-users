/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as _ from 'lodash';
import restify from "restify";
import restifyErrors from "restify-errors";
import td from 'testdouble';
const {anything,contains,isA} = td.matchers;
import { expect } from 'chai';
import tagizer from 'ganomede-tagizer';

// Disable delayed calls. We're doing synchronous tests.
(global.setImmediate as any) = func => { func(); }

const directory = require('../src/backend/directory');

const REQ_ID = "my-request-id";

const { EXISTING_USER, SECONDARY_USER, TERNARY_USER, NEW_USER, APP_ID,
  credentials, publicAccount, authResult,
  account, authAccount, facebookAccount,
  directoryAccount, directoryAliasesObj,
  facebookLogin
} = require('./directory-data');

// testdouble for the directory client
const directoryClientTD = function() {

  const directoryClient = td.object([
    'authenticate',
    'addAccount',
    'editAccount',
    'byAlias'
  ]);

  // .authenticate() with wrong credentials
  td.when(directoryClient.authenticate(
    td.matchers.anything()))
      .thenCallback(new restifyErrors.InvalidCredentialsError(), null);

  // .authenticate() with correct credentials
  td.when(directoryClient.authenticate(
    td.matchers.contains(directoryAccount(EXISTING_USER))))
      .thenCallback(null, authResult(EXISTING_USER));

  // .addAccount() succeeds
  td.when(directoryClient.addAccount(
    td.matchers.anything()))
      .thenCallback(null, null);

  // .editAccount() succeeds
  td.when(directoryClient.editAccount(
    td.matchers.anything()))
      .thenCallback(null, null);

  // .addAccount() fails if user already exists
  td.when(directoryClient.addAccount(
    td.matchers.contains(directoryAccount(EXISTING_USER))))
      .thenCallback(new restifyErrors.ConflictError(), null);

  // .byAlias() fails when alias not in directory
  td.when(directoryClient.byAlias(
    td.matchers.anything()))
      .thenCallback(new restifyErrors.NotFoundError(), null);

  // .byAlias() loads existing user by facebook id
  td.when(directoryClient.byAlias(
    td.matchers.contains({
      type: `facebook.id.${APP_ID}`,
      value: EXISTING_USER.facebook_id})
  )).thenCallback(null, {
    id: EXISTING_USER.id,
    aliases: directoryAliasesObj(EXISTING_USER)
  }
  );

  // .byAlias() loads existing user by email
  td.when(directoryClient.byAlias(
    contains({type: 'email', value: EXISTING_USER.email})
  )).thenCallback(null, {
    id: EXISTING_USER.id,
    aliases: directoryAliasesObj(EXISTING_USER)
  }
  );

  // .byAlias() loads existing user by email
  td.when(directoryClient.byAlias(
    contains({type: 'email', value: TERNARY_USER.email})
  )).thenCallback(null, {
    id: TERNARY_USER.id,
    aliases: directoryAliasesObj(TERNARY_USER)
  }
  );

  return directoryClient;
};

const authenticatorTD = function() {

  const authenticator = td.object([ 'add' ]);
  const addUser = user => td.when(authenticator.add(
    td.matchers.contains(publicAccount(user))))
      .thenReturn(authAccount(user));
  [ EXISTING_USER, SECONDARY_USER, TERNARY_USER, NEW_USER ].forEach(addUser);
  return authenticator;
};

const fbgraphClientTD = function() {

  const fbgraphClient = td.object([ 'get' ]);
  td.when(fbgraphClient.get(td.matchers.anything()))
    .thenCallback(new Error("fbgraph.get failed"), null);
  const addUser = function(user) {
    const token = `access_token=${user.facebook_access_token}`;
    const location = "location{location{country_code,longitude,latitude}}";
    const uri = `/v2.8/me?fields=id,name,email,${location},birthday&${token}`;
    return td.when(fbgraphClient.get(uri))
      // @ts-ignore
      .thenCallback(null, null, null, { // XXX: I had to comment this out for typescript to be happy, this might break the test.. 
        id: user.facebook_id,
        email: user.email,
        name: user.fullName,
        birthday: user.birthday,
        location: user.location
      }
    );
  };
  [ EXISTING_USER, SECONDARY_USER, TERNARY_USER, NEW_USER ].forEach(addUser);
  return fbgraphClient;
};

const aliasesClientTD = function() {
  const aliasesClient = td.object([ 'get' ]);

  td.when(aliasesClient.get(td.matchers.isA(String)))
    .thenCallback(null, '');

  td.when(aliasesClient.get(`fb:${SECONDARY_USER.facebook_id}`))
    .thenCallback(null, SECONDARY_USER.username);

  return aliasesClient;
};

const usermetaClientTD = function() {
  const ret = td.object([ 'set' ]);
  td.when(ret.set(contains({apiSecret:process.env.API_SECRET}),
    anything(), anything()))
    .thenCallback(null, {ok:true});
  const addUser = user => td.when(ret.set(contains({token:user.token}), anything(), anything()))
    .thenCallback(null, {ok:true});
  [ EXISTING_USER, SECONDARY_USER, TERNARY_USER, NEW_USER ].forEach(addUser);
  return ret;
};

const friendsClientTD = () => td.object([]);

const facebookFriendsTD = function() {
  const ret = td.object([ 'storeFriends' ]);
  td.when(ret.storeFriends(anything()))
    .thenDo(({callback}) => typeof callback === 'function' ? callback(null, {ok:true}) : undefined);
  return ret;
};

const facebookClientTD = () => td.object([]);

const passwordResetTemplateTD = function() {
  const passwordResetTemplate = td.object(['render']);
  td.when(passwordResetTemplate.render(anything()))
    .thenReturn({
      subject: "prt-subject",
      text: "prt-text",
      html: "prt-html"
  });
  return passwordResetTemplate;
};

const mailerTransportTD = function() {
  const mt = td.object(['sendMail']);
  td.when(mt.sendMail(anything()))
    .thenCallback(null, {messageId:'1234',response:'ok'});
  return mt;
};

const deferredEventsTD = () => td.object(['editEvent']);

const GENERATED_PASSWORD = 'blah1234';
const generatePasswordTD = function() {
  const gp = td.function('generatePassword');
  td.when(gp()).thenReturn(GENERATED_PASSWORD);
  return gp;
};

const baseTest = function() {
  const log = td.object([ 'debug', 'info', 'warn', 'error' ]);
  const fbgraphClient = fbgraphClientTD();
  const directoryClient = directoryClientTD();
  const authenticator = authenticatorTD();
  const aliasesClient = aliasesClientTD();
  const usermetaClient = usermetaClientTD();
  const friendsClient = friendsClientTD();
  const facebookFriends = facebookFriendsTD();
  const facebookClient = facebookClientTD();
  const mailerTransport = mailerTransportTD();
  const deferredEvents = deferredEventsTD();
  const passwordResetTemplate = passwordResetTemplateTD();
  const generatePassword = generatePasswordTD();
  const backend = directory.createBackend({
    log, authenticator, directoryClient, fbgraphClient, deferredEvents,
    facebookAppId: APP_ID, aliasesClient,
    usermetaClient, friendsClient, facebookFriends, facebookClient,
    passwordResetTemplate, mailerTransport, generatePassword });
  const callback = td.function('callback');
  return { callback, directoryClient, backend, aliasesClient, deferredEvents,
    usermetaClient, friendsClient, facebookFriends,
    facebookClient };
};

const backendTest = function() {
  const ret = baseTest();
  ret.backend.initialize((err, backend) => ret.backend = backend);
  return ret;
};

describe('backend/directory', function() {

  describe('.createBackend()', () => it('create a directory backend', function() {
    const { backend } = baseTest();
    return expect(backend).to.be.an('object');
  }));

  describe('backend.initialize()', () => it('loads the backend object', function() {
    const { backend, callback } = baseTest();
    backend.initialize(callback);
    return td.verify(callback(null, td.matchers.isA(Object)));
  }));

  describe('backend.loginAccount()', function() {

    const loginAccount = function(credentials) {
      const ret = backendTest();
      ret.backend.loginAccount(credentials, ret.callback);
      return ret;
    };

    it('attempts to authenticate with directory', function() {
      const { directoryClient } = loginAccount(credentials(EXISTING_USER));
      return td.verify(directoryClient.authenticate(
        td.matchers.contains(directoryAccount(EXISTING_USER)),
        td.callback)
      );
    });

    it('creates a auth token when login is successfull', function() {
      const { callback } = loginAccount(credentials(EXISTING_USER));
      return td.verify(callback(null, contains(authResult(EXISTING_USER))));
    });

    return it('fails when credentials are invalid', function() {
      const { callback } = loginAccount(credentials(NEW_USER));
      return td.verify(callback(td.matchers.isA(restifyErrors.InvalidCredentialsError)));
    });
  });

  describe('backend.createAccount()', function() {

    const createAccount = function(acc) {
      const ret = backendTest();
      td.when(ret.directoryClient.authenticate(
        contains(directoryAccount(acc))))
          .thenCallback(null, authResult(acc));
      ret.backend.createAccount(account(acc), ret.callback);
      return ret;
    };

    const hasAlias = matchedAlias => account => account.aliases.filter(testedAlias => (testedAlias.type === matchedAlias.type) &&
      (testedAlias.value === matchedAlias.value) &&
      (testedAlias.public === matchedAlias.public)).length > 0;

    it('adds an account with the provided id and password', function() {
      const { directoryClient } = createAccount(NEW_USER);
      return td.verify(directoryClient.addAccount(
        td.matchers.contains(directoryAccount(NEW_USER)),
        td.callback)
      );
    });

    it('adds the email as a private alias', function() {
      const { directoryClient } = createAccount(NEW_USER);
      const emailAlias = {
        type: 'email',
        public: false,
        value: NEW_USER.email
      };
      return td.verify(directoryClient.addAccount(
        td.matchers.argThat(hasAlias(emailAlias)),
        td.callback)
      );
    });

    it('adds the name as a public alias', function() {
      const { directoryClient } = createAccount(NEW_USER);
      const nameAlias = {
        type: 'name',
        public: true,
        value: NEW_USER.username
      };
      return td.verify(directoryClient.addAccount(
        td.matchers.argThat(hasAlias(nameAlias)),
        td.callback)
      );
    });

    it('adds the tag as a public alias', function() {
      const { directoryClient } = createAccount(NEW_USER);
      const tagAlias = {
        type: 'tag',
        public: true,
        value: tagizer.tag(NEW_USER.username)
      };
      return td.verify(directoryClient.addAccount(
        td.matchers.argThat(hasAlias(tagAlias)),
        td.callback)
      );
    });

    it('calls back on success', function() {
      const { callback } = createAccount(NEW_USER);
      return td.verify(callback(null, contains(authResult(NEW_USER))));
    });

    return it('fails when the given ID is not available', function() {
      const { backend, directoryClient, callback } = backendTest();
      backend.createAccount(account(EXISTING_USER), callback);
      return td.verify(callback(td.matchers.isA(restifyErrors.ConflictError)));
    });
  });

  describe('backend.sendPasswordResetEmail()', function() {

    const sendPasswordResetEmail = function(email) {
      const ret = backendTest();
      ret.backend.sendPasswordResetEmail({email}, ret.callback);
      return ret;
    };

    it('calls the callback with success when email exists', function() {
      const { callback } = sendPasswordResetEmail(EXISTING_USER.email);
      return td.verify(callback(null), {ignoreExtraArgs: true});
    });

    it('fails when the email is not known', function() {
      const { callback } = sendPasswordResetEmail(NEW_USER.email);
      return td.verify(callback(isA(restifyErrors.NotFoundError)));
    });

    return it('changes the user password', function() {
      const { callback, directoryClient } = sendPasswordResetEmail(EXISTING_USER.email);
      return td.verify(directoryClient.editAccount(
        contains({id: EXISTING_USER.id, password: GENERATED_PASSWORD})),
        {ignoreExtraArgs: true});
  });
});

  return describe('backend.loginFacebook()', function() {

    const loginFacebook = function(account, callback?) {
      const ret = backendTest();
      account.req_id = REQ_ID;
      ret.backend.loginFacebook(account, callback || ret.callback);
      return ret;
    };

    const loginWithout = function(fieldname) {
      const data = {
        accessToken: 'dummy',
        username: 'dummy',
        password: 'dummy'
      };
      delete data[fieldname];
      const { callback } = loginFacebook(data);
      return td.verify(callback(td.matchers.isA(restifyErrors.BadRequestError)));
    };

    it('requires an accessToken', () => loginWithout('accessToken'));
    it('requires an username', () => loginWithout('username'));
    it('requires an password', () => loginWithout('password'));

    it('checks facebook id with directory client', function() {
      const { directoryClient } =
        loginFacebook(facebookLogin(NEW_USER));
      return td.verify(directoryClient.byAlias(
        td.matchers.contains({
          type: `facebook.id.${APP_ID}`,
          value: NEW_USER.facebook_id}),
        td.callback)
      );
    });

    it('checks "fb:facebook_id" alias if not in directory', function() {
      const { aliasesClient, callback } = loginFacebook(facebookLogin(NEW_USER));
      return td.verify(aliasesClient.get(
        `fb:${NEW_USER.facebook_id}`,
        td.callback)
      );
    });

    it('adds metadata to CREATE events', function() {
      const { deferredEvents } =
        loginFacebook(facebookLogin(NEW_USER));
      return td.verify(deferredEvents.editEvent(
        REQ_ID, 'CREATE', "metadata", {
          country: NEW_USER.location.location.country_code,
          latitude: String(NEW_USER.location.location.latitude),
          longitude: String(NEW_USER.location.location.longitude),
          yearofbirth: NEW_USER.birthday.split('/')[2]
        })
      );
    });

    const itSavesBirthday = function(user) {
      const { usermetaClient } = loginFacebook(facebookLogin(user));
      return td.verify(usermetaClient.set(
        contains({
          username: user.username,
          apiSecret: process.env.API_SECRET}),
        "yearofbirth",
        user.birthday.split('/')[2],
        td.callback)
      );
    };

    it('saves the birthday of new users', () => itSavesBirthday(NEW_USER));

    //itSavesCountry = (user) ->
    //  { usermetaClient } = loginFacebook facebookLogin(user)
    //  td.verify usermetaClient.set(
    //    user.username, user.birthday, td.callback)
    //it 'saves the birthday of new users', ->
    //  itSavesBirthday NEW_USER

    const itSavesFullName = function(user) {
      const { usermetaClient } = loginFacebook(facebookLogin(user));
      return td.verify(usermetaClient.set(
        contains({
          username: user.username,
          apiSecret: process.env.API_SECRET}),
        "fullname", user.fullName, td.callback)
      );
    };

    it('saves the full name of new users', () => itSavesFullName(NEW_USER));

    it('saves the full name of existing users', () => itSavesFullName(EXISTING_USER));

    const itSavesFriends = function(user) {
      const { facebookFriends, aliasesClient, friendsClient,
        facebookClient } =
        loginFacebook(facebookLogin(user));
      return td.verify(facebookFriends.storeFriends(td.matchers.contains({
        aliasesClient,
        friendsClient,
        facebookClient,
        username: user.username,
        accessToken: user.facebook_access_token
      }))
      );
    };

    it('saves the users friends for new users', () => itSavesFriends(NEW_USER));
    it('saves the users friends for existing users', () => itSavesFriends(EXISTING_USER));

    it('logins directory-existing users', function() {
      const { callback } = loginFacebook(facebookLogin(EXISTING_USER));
      return td.verify(callback(null, td.matchers.contains({
        token: EXISTING_USER.token})
      )
      );
    });

    it('logins legacy-existing users', function() {
      const { callback } = loginFacebook(facebookLogin(SECONDARY_USER));
      return td.verify(callback(null, td.matchers.contains({
        token: SECONDARY_USER.token})
      )
      );
    });

    it('registers non existing user', function() {
      const { directoryClient, callback } =
        loginFacebook(facebookLogin(NEW_USER));
      td.verify(callback(null, td.matchers.contains({
        token:NEW_USER.token})
      )
      );
      return td.verify(directoryClient.addAccount(
        td.matchers.contains({id:NEW_USER.id}),
        td.callback)
      );
    });

    it('logins existing non-facebook directory users', function() {
      const { callback } = loginFacebook(facebookLogin(TERNARY_USER));
      return td.verify(callback(null, td.matchers.contains({
        token: TERNARY_USER.token})
      )
      );
    });

    return it('associates non-facebook directory users with facebook id', function() {
      const { directoryClient } = loginFacebook(facebookLogin(TERNARY_USER));
      return td.verify(directoryClient.editAccount({
        id: TERNARY_USER.id,
        aliases: [{
          type: "facebook.id.cc.fovea.test",
          value: TERNARY_USER.facebook_id,
          public: false
        }],
        req_id: REQ_ID
      }, td.callback)
      );
    });
  });
});

// vim: ts=2:sw=2:et:
