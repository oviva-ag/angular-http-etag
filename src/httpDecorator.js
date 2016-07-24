'use strict'

var angular = require('angular')
var objectKeys = require('object-keys')
var arrayMap = require('array-map')

module.exports = httpEtagHttpDecorator

httpEtagHttpDecorator.$inject = ['$delegate', 'httpEtag']

function httpEtagHttpDecorator ($delegate, httpEtag) {
  var $http = $delegate
  var cachableHttpMethods = [
    'GET',
    'JSONP'
  ]
  var $httpShortcutMethods = [
    'get',
    'head',
    'post',
    'put',
    'delete',
    'jsonp',
    'patch'
  ]

  function $httpDecorator (httpConfig) {
    var isCachable = httpConfig.etagCache && cachableHttpMethods.indexOf(httpConfig.method) >= 0
    var httpPromise

    if (isCachable) {
      var etagCacheConfig = processHttpConfigEtagValue(httpConfig)
      var itemCache = httpEtag.getItemCache(etagCacheConfig.id, etagCacheConfig.itemKey)
      var cacheInfo = itemCache.info()
      var cachedData = itemCache.get()
      var cachedEtag = cachedData && cachedData.etagHeader
      var cachedResponse = cachedEtag && cachedData.responseData

      // Allow easy access to cache in interceptor
      httpConfig.$$_itemCache = itemCache

      if (cachedEtag) {
        httpConfig.headers = angular.extend({}, httpConfig.headers, {
          'If-None-Match': cachedEtag
        })
      }
    }

    httpPromise = $http.apply($http, arguments)

    httpPromise.cached = function (callback) {
      if (isCachable && cachedData && cacheInfo.cacheResponseData) callback(cachedResponse, undefined, undefined, httpConfig, itemCache)
      return httpPromise
    }

    return httpPromise
  }

  // Decorate the shortcut methods, too
  angular.forEach($httpShortcutMethods, function (method) {
    var httpMethod = method.toUpperCase()
    var isCachable = cachableHttpMethods.indexOf(httpMethod) >= 0
    var shortcutMethod

    if (!isCachable) shortcutMethod = $http[method]
    else {
      shortcutMethod = function httpEtagHttpShortcutWrapper (url, config) {
        config = angular.extend({}, config, {
          method: httpMethod,
          url: url
        })

        return $httpDecorator.call($http, config)
      }
    }
    $httpDecorator[method] = shortcutMethod
  })

  /**
   * HELPERS
   */

  function processHttpConfigEtagValue (httpConfig) {
    var etagValue = httpConfig.etagCache
    var etagValueType = typeof etagValue
    var etagCacheConfig = {}

    if (etagValueType === 'object') {
      etagCacheConfig.id = etagValue.id
      etagCacheConfig.itemKey = etagValue.itemKey || generateCacheItemKey(httpConfig)
    } else if (etagValueType === 'string') {
      etagCacheConfig.id = etagValue
      etagCacheConfig.itemKey = generateCacheItemKey(httpConfig)
    } else if (etagValue === true) {
      // Undefined cacheId will use the default cacheId as defined in provider
      etagCacheConfig.itemKey = generateCacheItemKey(httpConfig)
    }
    return etagCacheConfig
  }

  function generateCacheItemKey (httpConfig) {
    var url = httpConfig.url
    var params = stringifyParams(httpConfig.params)
    return url + (url.indexOf('?') > 0 ? '&' : '?') + params
  }

  // Based on npm package "query-string"
  function stringifyParams (obj) {
    return obj ? arrayMap(objectKeys(obj).sort(), function (key) {
      var val = obj[key]

      if (angular.isArray(val)) {
        return arrayMap(val.sort(), function (val2) {
          return encodeURIComponent(key) + '=' + encodeURIComponent(val2)
        }).join('&')
      }

      return encodeURIComponent(key) + '=' + encodeURIComponent(val)
    }).join('&') : ''
  }

  return $httpDecorator
}
