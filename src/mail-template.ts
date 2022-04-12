import { MailerSendOptions } from "./mailer";

export type RenderTemplate<T> = {
  render(values: Record<string, string>): T;
  template:T;
}

export type CreateTemplateRenderer<T> = (template: T) => RenderTemplate<T>;

function renderDoc(doc: string, values: Record<string, string>): string {
  for (let v in values) {
    doc = doc.replace(new RegExp(`__${v}__`, 'g'), values[v]);
  }
  return doc;
};

function createTemplate<T extends Record<string, string | undefined> & Partial<MailerSendOptions>>(template: T) {
  return {
    render(values: Record<string, string>): Record<string, string> {
      const ret = {};
      for (const id in template) {
        const doc = template[id];
        if (doc !== undefined) {
          ret[id as string] = renderDoc(doc as string, values);
        }
      }
      return ret;
    }, template
  }
};

export default {createTemplate};
// vim: ts=2:sw=2:et:
