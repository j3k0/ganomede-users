renderDoc = (doc, values) ->
  for v of values
    doc = doc.replace new RegExp("__#{v}__", 'g'), values[v]
  doc

createTemplate = (template) ->
  render: (values) ->
    ret = {}
    for id of template
      ret[id] = renderDoc template[id], values
    ret

module.exports = {createTemplate}
# vim: ts=2:sw=2:et:
