const net = require('./src/net')
const inject = require('./src/inject')
const fs = require('./src/fs')
const axios = require('axios')

if (window.ztools) window.utools = window.ztools

window.preload = {
  getPlatform: () => {
    if (window.ztools) {
      return 'ZTools'
    } else if (window.utools) {
      return 'utools'
    }
    return 'browser'
  },
  net,
  inject,
  fs,
  axios: axios.create({
    adapter: 'http',
  })
}
