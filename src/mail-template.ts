export type RenderTemplate = {
  render(values: any): Record<string, any>;
}

export type CreateTemplateRenderer = (template: any) => RenderTemplate

const renderDoc = function (doc, values) {
  for (let v in values) {
    doc = doc.replace(new RegExp(`__${v}__`, 'g'), values[v]);
  }
  return doc;
};

const createTemplate: CreateTemplateRenderer = template => ({
  render(values) {
    const ret = {};
    for (let id in template) {
      ret[id] = renderDoc(template[id], values);
    }
    return ret;
  }
});

export default {createTemplate};
// vim: ts=2:sw=2:et:
