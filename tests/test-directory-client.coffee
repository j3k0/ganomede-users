describe 'directory-client', ->

  describe.skip '.addAccount()', ->
    it 'takes an object as argument', ->
      return
    it 'requires an argument with id, password, secret and aliases fields', ->
      return
    it 'sends a POST request to /directory/v1/users', ->
      return
    it 'sends a valid JSON body', ->
      return
    it 'reports failure when response status is not 200', ->
      return
    it 'reports failure when directory server is not reachable', ->
      return

  describe.skip '.editAccount()', ->
    it 'sends a POST request to /directory/v1/users/id/:id', ->
      return
    it 'reports failure when response status is not 200', ->
      return
    it 'reports failure when directory server is not reachable', ->
      return

  describe.skip '.authenticate()', ->
    it 'sends a POST request to /directory/v1/users/auth', ->
      return
    it 'sends "id" in the body', ->
      return
    it 'sends "password" in the body', ->
      return
    it 'reports failure when response status is not 200', ->
      return
    it 'returns the generated token when response status is 200', ->
      return

# vim: ts=2:sw=2:et:
