const fs = require('fs')
const PeerId = require('../src')

PeerId.create({}, (err, id) => {
  fs.writeFileSync('./fixtures/sample-id.json', JSON.stringify(id.toJSON()))
})