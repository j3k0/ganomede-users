mailer = require '../src/mailer'
td = require 'testdouble'
{verify,matchers} = td
{isA,anything,contains} = matchers
{expect} = require 'chai'
_ = require 'lodash'
calledOnce =
  times: 1
  ignoreExtraArgs: true

goodguy =
  email: 'goodguy@email.com'
  err: null
  messageInfo:
    messageId: '9'
    response: 'server accepts good guys'
badguy =
  email: 'badguy@email.com'
  err: new Error('server refuses bad guys')

options =
  host: 'bobmail.fovea.cc'
  port: '25'
  from: 'admin@ganomede.org'
  subject: 'default-subject'
  text: 'default-text'
  html: 'default-html'

nodemailerTransportTD = ->
  transport = td.object 'sendMail'
  [badguy, goodguy].forEach (guy) ->
    td.when(transport.sendMail(contains(to: guy.email)))
      .thenCallback(guy.err, guy.messageInfo)
  transport

nodemailerTD = ({nodemailerTransport}) ->
  nodemailer = td.object ['createTransport']
  td.when(nodemailer.createTransport(contains(
    host: options.host
    port: options.port
  ))).thenReturn nodemailerTransport
  nodemailer

transportOptions = ({nodemailer, log}) ->
  _.extend {}, {nodemailer, log}, options

baseTest = ->
  callback = td.function 'callback'
  nodemailerTransport = nodemailerTransportTD()
  nodemailer = nodemailerTD {nodemailerTransport}
  log = td.object ['debug', 'info', 'error']
  tb = require('bunyan').createLogger({name:'tbf'})
  td.when(log.debug(), {ignoreExtraArgs:true})
    .thenDo(tb.info.bind tb)
  _.extend {},
    {nodemailerTransport, nodemailer, log, callback},
    options

createTransport = ->
  test = baseTest()
  transport = mailer.createTransport transportOptions(test)
  _.extend {}, test, {transport}

describe 'mailer', ->

  describe '.createTransport', ->
    it 'returns an object with sendMail method', ->
      test = baseTest()
      transport = mailer.createTransport transportOptions(test)
      expect(transport).not.to.be.null
      expect(transport).to.be.an 'object'
      expect(transport.sendMail).to.be.a 'function'

  describe '.defaults', ->
    it 'exports default parameters from createTransport()', ->
      {transport} = createTransport()
      expect(transport.defaults).to.eql
        from: options.from
        subject: options.subject
        text: options.text
        html: options.html

  describe '.sendMail', ->

    sendMail = (options) ->
      test = createTransport()
      test.transport.sendMail options, test.callback
      test

    testSendMailOption = (inputOptions, outputOptions) ->
      {callback, nodemailerTransport} = sendMail inputOptions
      verify nodemailerTransport.sendMail(
        contains(outputOptions),
        td.callback)
      verify callback(), calledOnce

    it 'sends a mail using nodemailer', ->
      testSendMailOption {to:goodguy.email}, {to:goodguy.email}

    it 'uses default "from" when no value is provided', ->
      testSendMailOption {to:goodguy.email}, {from:options.from}
    it 'uses default "subject" when no value is provided', ->
      testSendMailOption {to:goodguy.email}, {subject:options.subject}
    it 'uses default "text" when no value is provided', ->
      testSendMailOption {to:goodguy.email}, {text:options.text}
    it 'uses default "html" when no value is provided', ->
      testSendMailOption {to:goodguy.email}, {html:options.html}

    it 'uses provided "from" when provided', ->
      testSendMailOption {to:goodguy.email, from:'whatever'},
        {from:'whatever'}
    it 'uses provided "subject" when provided', ->
      testSendMailOption {to:goodguy.email, subject:'whatever'},
        {subject:'whatever'}
    it 'uses provided "text" when provided', ->
      testSendMailOption {to:goodguy.email, text:'whatever'},
        {text:'whatever'}
    it 'uses provided "html" when provided', ->
      testSendMailOption {to:goodguy.email, html:'whatever'},
        {html:'whatever'}


# vim: ts=2:sw=2:et:
