/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import mailer from '../src/mailer';
import td from 'testdouble';
const {verify,matchers} = td;
const {isA,anything,contains} = matchers;
import { expect } from 'chai';
import _ from 'lodash';
const calledOnce = {
  times: 1,
  ignoreExtraArgs: true
};

const goodguy = {
  email: 'goodguy@email.com',
  err: null,
  messageInfo: {
    messageId: '9',
    response: 'server accepts good guys'
  }
};
const badguy = {
  email: 'badguy@email.com',
  err: new Error('server refuses bad guys')
};

const options = {
  host: 'bobmail.fovea.cc',
  port: '25',
  from: 'admin@ganomede.org',
  subject: 'default-subject',
  text: 'default-text',
  html: 'default-html'
};

const nodemailerTransportTD = function() {
  const transport = td.object('sendMail');
  [badguy, goodguy].forEach(guy => td.when(transport.sendMail(contains({to: guy.email})))
    .thenCallback(guy.err, guy.messageInfo));
  return transport;
};

const nodemailerTD = function({nodemailerTransport}) {
  const nodemailer = td.object(['createTransport']);
  td.when(nodemailer.createTransport(contains({
    host: options.host,
    port: options.port
  }))).thenReturn(nodemailerTransport);
  return nodemailer;
};

const transportOptions = ({nodemailer, log}) => _.extend({}, {nodemailer, log}, options);

const baseTest = function() {
  const callback = td.function('callback');
  const nodemailerTransport = nodemailerTransportTD();
  const nodemailer = nodemailerTD({nodemailerTransport});
  const log = td.object(['debug', 'info', 'error']);
  const tb = require('bunyan').createLogger({name:'tbf'});
  td.when(log.debug(), {ignoreExtraArgs:true})
    .thenDo(tb.info.bind(tb));
  return _.extend({},
    {nodemailerTransport, nodemailer, log, callback},
    options);
};

const createTransport = function() {
  const test = baseTest();
  const transport = mailer.createTransport(transportOptions(test));
  return _.extend({}, test, {transport});
};

describe('mailer', function() {

  describe('.createTransport', () => it('returns an object with sendMail method', function() {
    const test = baseTest();
    const transport = mailer.createTransport(transportOptions(test));
    expect(transport).not.to.be.null;
    expect(transport).to.be.an('object');
    return expect(transport.sendMail).to.be.a('function');
  }));

  describe('.defaults', () => it('exports default parameters from createTransport()', function() {
    const {transport} = createTransport();
    return expect(transport.defaults).to.eql({
      from: options.from,
      subject: options.subject,
      text: options.text,
      html: options.html
    });
  }));

  return describe('.sendMail', function() {

    const sendMail = function(options) {
      const test = createTransport();
      test.transport.sendMail(options, test.callback);
      return test;
    };

    const testSendMailOption = function(inputOptions, outputOptions) {
      const {callback, nodemailerTransport} = sendMail(inputOptions);
      verify(nodemailerTransport.sendMail(
        contains(outputOptions),
        td.callback)
      );
      return verify(callback(), calledOnce);
    };

    it('sends a mail using nodemailer', () => testSendMailOption({to:goodguy.email}, {to:goodguy.email}));

    it('uses default "from" when no value is provided', () => testSendMailOption({to:goodguy.email}, {from:options.from}));
    it('uses default "subject" when no value is provided', () => testSendMailOption({to:goodguy.email}, {subject:options.subject}));
    it('uses default "text" when no value is provided', () => testSendMailOption({to:goodguy.email}, {text:options.text}));
    it('uses default "html" when no value is provided', () => testSendMailOption({to:goodguy.email}, {html:options.html}));

    it('uses provided "from" when provided', () => testSendMailOption({to:goodguy.email, from:'whatever'},
      {from:'whatever'}));
    it('uses provided "subject" when provided', () => testSendMailOption({to:goodguy.email, subject:'whatever'},
      {subject:'whatever'}));
    it('uses provided "text" when provided', () => testSendMailOption({to:goodguy.email, text:'whatever'},
      {text:'whatever'}));
    return it('uses provided "html" when provided', () => testSendMailOption({to:goodguy.email, html:'whatever'},
      {html:'whatever'}));
});
});


// vim: ts=2:sw=2:et:
