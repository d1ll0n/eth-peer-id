/*
 * Id is an object representation of a peer Id. a peer Id is a multihash
 */

'use strict'

const mh = require('multihashes')
const multihashing = require('multihashing-async')
const cryptoKeys = require('libp2p-crypto/src/keys')
const assert = require('assert')
const withIs = require('class-is')
const { publicToAddress } = require('ethereumjs-util')

const publicToId = async (publicKey, cb) => {
  return multihashing(publicToAddress(publicKey, true), 'sha3-256')
    .then(id => cb(null, id))
    .catch(err => cb(err))
}

const publicToIdAsync = (publicKey) => new Promise((resolve, reject) => 
  publicToId(publicKey, (err, id) =>
    err ? reject(err) : resolve(id)
))

class PeerId {
  constructor (id, privKey, pubKey) {
    assert(Buffer.isBuffer(id), 'invalid id provided')

    if (privKey && pubKey) {
      assert(privKey.public.bytes.equals(pubKey.bytes), 'inconsistent arguments')
    }

    this._id = id
    this._idB58String = mh.toB58String(this.id)
    this._privKey = privKey
    this._pubKey = pubKey
  }

  get id () {
    return this._id
  }

  set id (val) {
    throw new Error('Id is immutable')
  }

  get privKey () {
    return this._privKey
  }

  set privKey (privKey) {
    this._privKey = privKey
  }

  get pubKey () {
    if (this._pubKey) {
      return this._pubKey
    }

    if (this._privKey) {
      return this._privKey.public
    }
  }

  set pubKey (pubKey) {
    this._pubKey = pubKey
  }

  // Return the protobuf version of the public key, matching go ipfs formatting
  marshalPubKey () {
    if (this.pubKey) {
      return cryptoKeys.marshalPublicKey(this.pubKey, 'secp256k1')
    }
  }

  // Return the protobuf version of the private key, matching go ipfs formatting
  marshalPrivKey () {
    if (this.privKey) {
      return cryptoKeys.marshalPrivateKey(this.privKey, 'secp256k1')
    }
  }

  toPrint () {
    let pid = this.toB58String()
    // All sha256 nodes start with Qm
    // We can skip the Qm to make the peer.ID more useful
    if (pid.startsWith('Qm')) {
      pid = pid.slice(2)
    }
    let maxRunes = 6
    if (pid.length < maxRunes) {
      maxRunes = pid.length
    }

    return '<peer.ID ' + pid.substr(0, maxRunes) + '>'
  }

  // return the jsonified version of the key, matching the formatting
  // of go-ipfs for its config file
  toJSON () {
    return {
      id: this.toB58String(),
      privKey: toB64Opt(this.marshalPrivKey()),
      pubKey: toB64Opt(this.marshalPubKey())
    }
  }

  // encode/decode functions
  toHexString () {
    return mh.toHexString(this.id)
  }

  toBytes () {
    return this.id
  }

  toB58String () {
    return this._idB58String
  }

  isEqual (id) {
    if (Buffer.isBuffer(id)) {
      return this.id.equals(id)
    } else if (id.id) {
      return this.id.equals(id.id)
    } else {
      throw new Error('not valid Id')
    }
  }

  /*
   * Check if this PeerId instance is valid (privKey -> pubKey -> Id)
   */
  isValid (callback) {
    // TODO Needs better checking
    if (this.privKey &&
      this.privKey.public &&
      this.privKey.public.bytes &&
      Buffer.isBuffer(this.pubKey.bytes) &&
      this.privKey.public.bytes.equals(this.pubKey.bytes)) {
      callback()
    } else {
      callback(new Error('Keys not match'))
    }
  }
}

const PeerIdWithIs = withIs(PeerId, { className: 'PeerId', symbolName: '@libp2p/js-peer-id/PeerId' })

exports = module.exports = PeerIdWithIs

// generation
exports.create = function (_, callback) {
  if (!callback) callback = _
  cryptoKeys.generateKeyPair('secp256k1', 256, (err, key) => {
    if (err) throw err
    publicToId(key.public._key, (err, id) => {
      if (err) return callback(err)
      callback(null, new PeerIdWithIs(id, key))
    })
  })
}

exports.createFromHexString = function (str) {
  return new PeerIdWithIs(mh.fromHexString(str))
}

exports.createFromBytes = function (buf) {
  return new PeerIdWithIs(buf)
}

exports.createFromB58String = function (str) {
  return new PeerIdWithIs(mh.fromB58String(str))
}

// Public Key input will be a buffer
exports.createFromPubKey = function (key, callback) {
  if (typeof callback !== 'function') throw new Error('callback is required')

  let pubKey

  try {
    let buf = key
    if (typeof buf === 'string') buf = Buffer.from(key, 'base64')
    if (!Buffer.isBuffer(buf)) throw new Error('Supplied key is neither a base64 string nor a buffer')

    pubKey = cryptoKeys.unmarshalPublicKey(buf)
    publicToId(pubKey._key, (err, id) => {
      if (err) return callback(err)
      callback(null, new PeerIdWithIs(id, null, pubKey))
    })
  } catch (err) {
    return callback(err)
  }
}

exports.createFromAddress = function(address, callback) {
  return multihashing(address, 'sha3-256')
    .then(id => callback(null, new PeerIdWithIs(id, null, null)))
    .catch(err => callback(err))
}

// Private key input will be a string
exports.createFromPrivKey = function (key, callback) {
  if (typeof callback !== 'function') throw new Error('callback is required')

  let buf = key

  try {
    if (typeof buf === 'string') buf = Buffer.from(key, 'base64')
    if (!Buffer.isBuffer(buf)) throw new Error('Supplied key is neither a base64 string nor a buffer')

    cryptoKeys.unmarshalPrivateKey(buf, (err, key) => {
      if (err) return callback(err)
      publicToId(key._publicKey, (err, id) => {
        if (err) return callback(err)
        callback(null, new PeerIdWithIs(id, key, key.public))
      })
    })

  } catch (err) {
    return callback(err)
  }
}

exports.createFromJSON = function (obj, callback) {
  if (typeof callback !== 'function') {
    throw new Error('callback is required')
  }

  let id
  let rawPrivKey
  let rawPubKey
  let pub

  try {
    id = mh.fromB58String(obj.id)
    rawPrivKey = obj.privKey && Buffer.from(obj.privKey, 'base64')
    rawPubKey = obj.pubKey && Buffer.from(obj.pubKey, 'base64')
    pub = rawPubKey && cryptoKeys.unmarshalPublicKey(rawPubKey)
  } catch (err) {
    return callback(err)
  }
  if (!rawPrivKey) return callback(null, new PeerIdWithIs(id, null, pub))

  cryptoKeys.unmarshalPrivateKey(rawPrivKey, async (err, privKey) => {
    if (err) return callback(err)
    let pubKey = cryptoKeys.unmarshalPublicKey(rawPubKey)
    let privId = await publicToIdAsync(privKey.public._key)
    let pubId = await publicToIdAsync(pubKey._key)
    if (!privId.equals(id)) return callback(new Error('Id and private key do not match'))
    if (!privId.equals(pubId)) return callback(new Error('Public and private key do not match'))
    callback(null, new PeerIdWithIs(id, privKey, pubKey))
  })
}

exports.isPeerId = function (peerId) {
  return Boolean(typeof peerId === 'object' &&
    peerId._id &&
    peerId._idB58String)
}

exports.publicToId = publicToId
exports.publicToIdAsync = publicToIdAsync

function toB64Opt (val) {
  if (val) {
    return val.toString('base64')
  }
}
