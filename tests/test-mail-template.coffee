'use strict'

td = require 'testdouble'
{expect} = require 'chai'
mailTemplate = require '../src/mail-template'

documents =
  once:  'hello __name__'
  twice: 'your name is __name__, yes: __name__'
  multi: '__name__ is __name__ and not __me__'
  undef: 'undefined: __undef__'

describe 'mail-template', ->
  describe '.createTemplate', ->
    it 'create a template with a render method', ->
      template = mailTemplate.createTemplate {}
      expect(template).to.be.a 'object'
      expect(template.render).to.be.a 'function'
  describe '.render', ->
    it 'remplaces all template documents with values', ->
      name = 'jeko'
      me = 'mail'
      template = mailTemplate.createTemplate documents
      rendered = template.render {name,me}
      expect(rendered).to.be.eql
        once: 'hello jeko'
        twice: 'your name is jeko, yes: jeko'
        multi: 'jeko is jeko and not mail'
        undef: 'undefined: __undef__'
# vim: ts=2:sw=2:et:
