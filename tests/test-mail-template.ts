/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import td from 'testdouble';
import { expect } from 'chai';
import mailTemplate from '../src/mail-template';

const documents = {
  once:  'hello __name__',
  twice: 'your name is __name__, yes: __name__',
  multi: '__name__ is __name__ and not __me__',
  undef: 'undefined: __undef__'
};

describe('mail-template', function() {
  describe('.createTemplate', () => it('create a template with a render method', function() {
    const template = mailTemplate.createTemplate({});
    expect(template).to.be.a('object');
    return expect(template.render).to.be.a('function');
  }));
  return describe('.render', () => it('remplaces all template documents with values', function() {
    const name = 'jeko';
    const me = 'mail';
    const template = mailTemplate.createTemplate(documents);
    const rendered = template.render({name,me});
    return expect(rendered).to.be.eql({
      once: 'hello jeko',
      twice: 'your name is jeko, yes: jeko',
      multi: 'jeko is jeko and not mail',
      undef: 'undefined: __undef__'
    });
  }));
});
// vim: ts=2:sw=2:et:
