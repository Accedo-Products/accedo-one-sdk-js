import uuidLib from 'uuid';
import stampit from 'stampit';
import qs from 'qs';
import fetch from 'isomorphic-fetch';

const MIME_TYPE_JSON = 'application/json';
const HOST = 'https://appgrid-api.cloud.accedo.tv';
const credentials = 'same-origin'; // NOTE: This option is required in order for Fetch to send cookies
const defaultHeaders = { accept: MIME_TYPE_JSON };

const getForwardedForHeader = ({ clientIp }) => {
  if (!clientIp) { return {}; }
  return { 'X-FORWARDED-FOR': clientIp };
};

const getSessionHeader = ({ sessionKey }) => {
  if (!sessionKey) { return {}; }
  return { 'X-SESSION': sessionKey };
};

const getContentTypeHeader = () => ({ 'Content-Type': MIME_TYPE_JSON });

const getQueryString = (config, existingQs = {}) => {
  const defaultQs = {
    appKey: config.appKey,
    uuid: config.deviceId
  };
  if (config.gid) { defaultQs.gid = config.gid; }
  const qsObject = Object.assign({}, existingQs, defaultQs);
  const queryString = qs.stringify(qsObject);
  return queryString;
};

const getRequestUrlWithQueryString = (path, config) => {
  const splitUrl = path.split('?');
  const pathWithoutQs = splitUrl[0];
  const existingQs = qs.parse(splitUrl[1]);
  const queryString = getQueryString(config, existingQs);
  return `${HOST}${pathWithoutQs}?${queryString}`;
};

const getExtraHeaders = (options) => {
  return Object.assign({}, getForwardedForHeader(options), getSessionHeader(options));
};

const getFetch = (path, config) => {
  const headers = Object.assign({}, defaultHeaders, getExtraHeaders(config));
  const requestUrl = getRequestUrlWithQueryString(path, config);
  config.log(`Sending a GET request to: ${requestUrl} with the following headers`, headers);
  return fetch(requestUrl, { credentials, headers })
    .then(res => {
      if (res.status >= 400) {
        config.log('GET failed with status', res.status);
        throw res;
      }
      return res;
    });
};

const grab = (path, config) => {
  config.log('Requesting', path);
  return getFetch(path, config)
    .then(res => res.json())
    .then((response) => {
      config.log('GET response', response);
      return response;
    });
};

const grabRaw = (path, config) => {
  return getFetch(path, config)
    .then((response) => {
      return response.body;
    });
};

const post = (path, config, body = {}) => {
  const headers = Object.assign({},
    defaultHeaders,
    getContentTypeHeader(),
    getExtraHeaders(config)
  );
  const requestUrl = getRequestUrlWithQueryString(path, config);
  config.log(`Sending a POST request to: ${requestUrl}. With the following headers and body: `, headers, body);
  const options = {
    headers,
    credentials,
    method: 'post',
    body: JSON.stringify(body)
  };
  return fetch(requestUrl, options)
    .then(({ status, statusText }) => {
      if (status !== 200) { throw new Error(`AppGrid POST request returned a non-200 response. Status Code: ${status}. Status Text: ${statusText}`); }
      const result = { status, statusText };
      config.log('POST response: ', { status, statusText });
      return result;
    });
};

const stamp$2 = stampit().methods({
  /**
   * Returns the currently stored sessionKey for this client instance
   * @return {string}  the sessionKey, if any
   */
  getSessionKey() {
    return this.props.config.sessionKey;
  },

  /**
   * Create a session and store it for reuse in this client instance
   * @return {promise}  a promise of a string, the sessionKey
   */
  createSession() {
    // ignore any existing session
    if (this.props.config.sessionKey) {
      this.props.config.sessionKey = null;
    }
    return grab('/session', this.props.config).then((json) => {
      const { sessionKey } = json;
      // update the context of this client, adding the session key
      this.props.config.sessionKey = sessionKey;
      return sessionKey;
    });
  },

  /**
   * If a sessionKey exists, calls the next function, then:
   * - If this failed with a 401 (unauthorized), create a session then retry
   * - Otherwise returns a promise of that function's results
   * If there was no sessionKey, create one before attempting the next function.
   * @private
   * @param {function} next a function that returns a promise
   * @return {promise}  a promise of the result of the next function
   */
  withSessionHandling(next) {
    // existing session
    if (this.getSessionKey()) {
      return next().catch(res => {
        if (res && res.status === 401) {
          // session expired - recreate one then retry
          return this.createSession().then(next);
        }
        // otherwise propagate the failure
        throw res;
      });
    }
    // no session - create it first, then launch the next action
    return this.createSession().then(next);
  }
});

function getPathWithQs(path, params = {}) {
  const { id, typeId, alias, preview, at, offset, size } = params;
  const qsParams = {};
  // The id array must be turned into CSV
  if (id && id.length) { qsParams.id = `${id.join(',')}`; }
  // The alias array must be turned into CSV
  if (alias && alias.length) { qsParams.alias = `${alias.join(',')}`; }
  // preview is only useful when true
  if (preview) { qsParams.preview = true; }
  // at is either a string, or a method with toISOString (like a Date) that we use for formatting
  if (typeof at === 'string') {
    qsParams.at = at;
  } else if (at && at.toISOString) {
    qsParams.at = at.toISOString();
  }
  // Add curated and non-curated params
  const queryString = qs.stringify(Object.assign({}, qsParams, { typeId, offset, size }));
  return `${path}?${queryString}`;
}

function request(path, params) {
  const pathWithQs = getPathWithQs(path, params);
  return this.withSessionHandling(() => grab(pathWithQs, this.props.config));
}

const stamp$1 = stampit()
.methods({
  /**
   * Get all the content entries, based on the given parameters.
   * **DO NOT** use several of id, alias and typeId at the same time - behaviour would be ungaranteed.
   * @param {object} [params] a parameters object
   * @param {boolean} [params.preview] when true, get the preview version
   * @param {string|date} [params.at] when given, get the version at the given time
   * @param {array} [params.id] an array of entry ids (strings)
   * @param {array} [params.alias] an array of entry aliases (strings)
   * @param {string} [params.typeId] only return entries matching this type id
   * @param {number|string} [params.size] limit to that many results per page (limits as per AppGrid API, currently 1 to 50, default 20)
   * @param {number|string} [params.offset] offset the result by that many pages
   * @return {promise}  a promise of an array of entries (objects)
   */
  getEntries(params) {
    return request.call(this, '/content/entries', params);
  },

  /**
   * Get one content entry by id, based on the given parameters.
   * @param {string} id the entry id
   * @param {object} [params] a parameters object
   * @param {boolean} [params.preview] when true, get the preview version
   * @param {string|date} [params.at] when given, get the version at the given time
   * @return {promise}  a promise of an entry (object)
   */
  getEntryById(id, params) {
    return request.call(this, `/content/entry/${id}`, params);
  },

  /**
   * Get one content entry, based on the given parameters.
   * @param {object} alias the entry alias
   * @param {object} [params] a parameters object
   * @param {boolean} [params.preview] when true, get the preview version
   * @param {string|date} [params.at] when given, get the version at the given time
   * @return {promise}  a promise of an entry (object)
   */
  getEntryByAlias(alias, params) {
    return request.call(this, `/content/entry/alias/${alias}`, params);
  }
})
// Make sure we have the sessionStamp withSessionHandling method
.compose(stamp$2);

const stamp$3 = stampit()
.methods({
  /**
   * Get the current application status
   * @return {promise}  a promise of the application status (string)
   */
  getApplicationStatus() {
    return this.withSessionHandling(() => grab('/status', this.props.config));
  }
})
// Make sure we have the sessionStamp withSessionHandling method
.compose(stamp$2);

const stamp$4 = stampit()
.methods({
  /**
   * Lists all the assets.
   * @return {promise}  a promise of a hash of assets (key: asset name, value: asset URL)
   */
  getAllAssets() {
    return this.withSessionHandling(() => grab('/asset', this.props.config));
  },

  /**
   * Get a stream for one asset by id
   * @param {string} id the asset id
   * @return {promise}  a promise of a node stream
   */
  getAssetById(id) {
    // note this method does not need a session
    return grabRaw(`/asset/${id}`, this.props.config);
  }
})
// Make sure we have the sessionStamp withSessionHandling method
.compose(stamp$2);

function sendUsageEvent(eventType, retentionTime) {
  const payload = { eventType };
  if (retentionTime !== undefined) { payload.retentionTime = retentionTime; }
  return this.withSessionHandling(() => post('/event/log', this.props.config, payload));
}

const stamp$5 = stampit()
.methods({
  /**
   * Send a usage START event
   * @return {promise}  a promise denoting the success of the operation
   */
  sendUsageStartEvent() {
    return sendUsageEvent.call(this, 'START');
  },

  /**
   * Send a usage QUIT event
   * @param {number|string} [retentionTimeInSeconds] the retention time, in seconds
   * @return {promise}  a promise denoting the success of the operation
   */
  sendUsageStopEvent(retentionTimeInSeconds) {
    return sendUsageEvent.call(this, 'QUIT', retentionTimeInSeconds);
  }
})
// Make sure we have the sessionStamp withSessionHandling method
.compose(stamp$2);

const DEBUG = 'debug';
const INFO = 'info';
const WARN = 'warn';
const ERROR = 'error';

const LOG_LEVELS = [DEBUG, INFO, WARN, ERROR];

const getConcatenatedCode = (facilityCode = 0, errorCode = 0) =>
  parseInt(`${facilityCode}${errorCode}`, 10);

const getLogMessage = (message, metadata) =>
  message + (!metadata ? '' : ` | Metadata: ${JSON.stringify(metadata)}`);

const getLogEvent = (details = {}, metadata) => {
  const message = getLogMessage(details.message, metadata);
  const code = getConcatenatedCode(details.facilityCode, details.errorCode);
  const dimensions = {
    dim1: details.dim1,
    dim2: details.dim2,
    dim3: details.dim3,
    dim4: details.dim4
  };
  return {
    code,
    message,
    dimensions
  };
};

const getCurrentTimeOfDayDimValue = () => {
  const hour = new Date().getHours();
  // NOTE: These strings are expected by AppGrid
  switch (true) {
  case (hour >= 1 && hour < 5):
    return '01-05';
  case (hour >= 5 && hour < 9):
    return '05-09';
  case (hour >= 9 && hour < 13):
    return '09-13';
  case (hour >= 13 && hour < 17):
    return '13-17';
  case (hour >= 17 && hour < 21):
    return '17-21';
  default:
    return '21-01';
  }
};

function request$1(path) {
  return this.withSessionHandling(() => grab(path, this.props.config));
}

function postLog(level, log) {
  return this.withSessionHandling(() => post(`/application/log/${level}`, this.props.config, log));
}

const stamp$6 = stampit()
.methods({
  /**
   * Get the current log level
   * @return {promise}  a promise of the log level (string)
   */
  getLogLevel() {
    return request$1.call(this, '/application/log/level').then(json => json.logLevel);
  },
  /**
   * Send a log with the given level, details and extra metadata.
   * @param {string} level the log level
   * @param {object} details the log information
   * @param {string} details.message the log message
   * @param {string} details.facilityCode the facility code
   * @param {errorCode} details.errorCode the error code
   * @param {string} details.dim1 the dimension 1 information
   * @param {string} details.dim2 the dimension 2 information
   * @param {string} details.dim3 the dimension 3 information
   * @param {string} details.dim4 the dimension 4 information
   * @param {array} [metadata] an array of extra metadata (will go through JSON.stringify)
   * @return {promise}  a promise of the success of the operation
   */
  sendLog(level, details, ...metadata) {
    if (!LOG_LEVELS.includes(level)) { return Promise.reject('Unsupported log level'); }
    const log = getLogEvent(details, metadata);
    return postLog.call(this, level, log);
  }
})
// Make sure we have the sessionStamp withSessionHandling method
.compose(stamp$2);

const stamp$7 = stampit()
.methods({
  /**
   * Get all the enabled plugins
   * @return {promise}  a promise of the requested data
   */
  getAllEnabledPlugins() {
    return this.withSessionHandling(() => grab('/plugins', this.props.config));
  }

})
// Make sure we have the sessionStamp withSessionHandling method
.compose(stamp$2);

const stamp$8 = stampit()
.methods({
  /**
   * Get the profile information
   * @return {promise}  a promise of the requested data
   */

  getProfileInfo() {
    return this.withSessionHandling(() => grab('/profile', this.props.config));
  }
})
// Make sure we have the sessionStamp withSessionHandling method
.compose(stamp$2);

function request$2(path) {
  return this.withSessionHandling(() => grab(path, this.props.config));
}

const stamp$9 = stampit()
.methods({
  /**
   * Get all the metadata
   * @return {promise}  a promise of the requested data
   */
  getAllMetadata() {
    return request$2.call(this, '/metadata');
  },

  /**
   * Get the metadata by a specific key
   * @param {string} key a key to get specific metadata
   * @return {promise}  a promise of the requested data
   */
  getMetadataByKey(key) {
    return request$2.call(this, `/metadata/${key}`);
  },

  /**
   * Get the metadata by specific keys
   * @param {array} keys an array of keys (strings)
   * @return {promise}  a promise of the requested data
   */
  getMetadataByKeys(keys) {
    return request$2.call(this, `/metadata/${keys.join(',')}`);
  }
})
// Make sure we have the sessionStamp withSessionHandling method
.compose(stamp$2);

const APPLICATION_SCOPE = 'user';
const APPLICATION_GROUP_SCOPE = 'group';

function requestGet(path) {
  return this.withSessionHandling(() => grab(path, this.props.config));
}

function requestPost(path, data) {
  return this.withSessionHandling(() => post(path, this.props.config, data));
}

function getAllDataByUser(scope, userName) {
  return requestGet.call(this, `/${scope}/${userName}`);
}

function getDataByUserAndKey(scope, userName, key) {
  return requestGet.call(this, `/${scope}/${userName}/${key}?json=true`);
}

function setUserData(scope, userName, data) {
  return requestPost.call(this, `/${scope}/${userName}`, data);
}

function setUserDataByKey(scope, userName, key, data) {
  return requestPost.call(this, `/${scope}/${userName}/${key}`, data);
}

const stamp$10 = stampit()
.methods({
  /**
   * Get all the application-scope data for a given user
   * @param {string} userName an appgrid user
   * @return {promise}  a promise of the requested data
   */
  getAllApplicationScopeDataByUser(userName) {
    return getAllDataByUser.call(this, APPLICATION_SCOPE, userName);
  },

  /**
   * Get all the application-group-scope data for a given user
   * @param {string} userName an appgrid user
   * @return {promise}  a promise of the requested data
   */
  getAllApplicationGroupScopeDataByUser(userName) {
    return getAllDataByUser.call(this, APPLICATION_GROUP_SCOPE, userName);
  },

  /**
   * Get all the application-scope data for a given user and data key
   * @param {string} userName an appgrid user
   * @param {string} key a key to specify what data to obtain
   * @return {promise}  a promise of the requested data
   */
  getApplicationScopeDataByUserAndKey(userName, key) {
    return getDataByUserAndKey.call(this, APPLICATION_SCOPE, userName, key);
  },

  /**
   * Get all the application-group-scope data for a given user
   * @param {string} userName an appgrid user
   * @param {string} key a key to specify what data to obtain
   * @return {promise}  a promise of the requested data
   */
  getApplicationGroupScopeDataByUserAndKey(userName, key) {
    return getDataByUserAndKey.call(this, APPLICATION_GROUP_SCOPE, userName, key);
  },

  /**
   * Set the application-scope data for a given user
   * @param {string} userName an appgrid user
   * @param {object} data the data to store
   * @return {promise}  a promise of the requested data
   */
  setApplicationScopeUserData(userName, data) {
    return setUserData.call(this, APPLICATION_SCOPE, userName, data);
  },

  /**
   * Set the application-group-scope data for a given user
   * @param {string} userName an appgrid user
   * @param {object} data the data to store
   * @return {promise}  a promise of the requested data
   */
  setApplicationGroupScopeUserData(userName, data) {
    return setUserData.call(this, APPLICATION_GROUP_SCOPE, userName, data);
  },

  /**
   * Set the application-scope data for a given user
   * @param {string} userName an appgrid user
   * @param {string} key a key to specify what data to obtain
   * @param {object} data the data to store
   * @return {promise}  a promise of the requested data
   */
  setApplicationScopeUserDataByKey(userName, key, data) {
    return setUserDataByKey.call(this, APPLICATION_SCOPE, userName, key, data);
  },

  /**
   * Set the application-group-scope data for a given user
   * @param {string} userName an appgrid user
   * @param {string} key a key to specify what data to obtain
   * @param {object} data the data to store
   * @return {promise}  a promise of the requested data
   */
  setApplicationGroupScopeUserDataByKey(userName, key, data) {
    return setUserDataByKey.call(this, APPLICATION_GROUP_SCOPE, userName, key, data);
  }
})
// Make sure we have the sessionStamp withSessionHandling method
.compose(stamp$2);

// Simply compose all the stamps in one single stamp to give access to all methods
const stamp = stampit().compose(
  stamp$2,
  stamp$1,
  stamp$3,
  stamp$4,
  stamp$5,
  stamp$6,
  stamp$7,
  stamp$8,
  stamp$9,
  stamp$10
);

const cookieParser = require('cookie-parser')();

const SIXTY_YEARS_IN_MS = 2147483647000;
const COOKIE_DEVICE_ID = 'ag_d';
const COOKIE_SESSION_KEY = 'ag_s';

const defaultGetRequestInfo = (req) => ({ deviceId: req.cookies[COOKIE_DEVICE_ID], sessionKey: req.cookies[COOKIE_SESSION_KEY] });
const defaultOnDeviceIdGenerated = (id, res) => res.cookie(COOKIE_DEVICE_ID, id, { maxAge: SIXTY_YEARS_IN_MS, httpOnly: true });
const defaultOnSessionKeyChanged = (key, res) => res.cookie(COOKIE_SESSION_KEY, key, { maxAge: SIXTY_YEARS_IN_MS, httpOnly: true });

// See doc in index.js where this is used
const factory = (appgrid) => (config) => {
  const {
    appKey,
    getRequestInfo = defaultGetRequestInfo,
    onDeviceIdGenerated = defaultOnDeviceIdGenerated,
    onSessionKeyChanged = defaultOnSessionKeyChanged,
    log
  } = config;
  return (req, res, next) => cookieParser(req, res, () => {
    const { deviceId, sessionKey } = getRequestInfo(req);
    // res.locals is a good place to store response-scoped data
    res.locals.appgridClient = appgrid({
      appKey,
      deviceId,
      sessionKey,
      log,
      onDeviceIdGenerated: id => onDeviceIdGenerated(id, res),
      onSessionKeyChanged: key => onSessionKeyChanged(key, res)
    });
    next();
  });
};

const noop = () => {};

/**
 * Check the parameters given are good enough to make api calls
 * @function
 * @param  {string} $0.appKey        the application key
 * @param  {string} [$0.deviceId]        a deviceId identifying the client we will make requests for
 * @param  {string} [$0.sessionKey]  a session key corresponding to this deviceId/appKey tuple
 * @return {boolean}                 true when all is well
 * @private
 */
const checkUsability = ({ appKey, deviceId, sessionKey } = {}) =>
  (appKey && !deviceId && !sessionKey) ||
  (appKey && deviceId && !sessionKey) ||
  (appKey && deviceId && sessionKey);

/**
 * Factory function to create an instance of an AppGrid client.
 *
 * You must get an instance before accessing any of the exposed client APIs.
 * @function
 * @param  {object} config the configuration for the new instance
 * @param  {string} config.appKey the application Key
 * @param  {string} [config.deviceId] the device identifier (if not provided, a uuid will be generated instead)
 * @param  {string} [config.sessionKey] the sessionKey (note a new one may be created when not given or expired)
 * @param  {function} [config.log] a function to use to see this SDK's logs
 * @param  {function} [config.onDeviceIdGenerated] callback to obtain the new deviceId, if one gets generated
 * @param  {function} [config.onSessionKeyChanged] callback to obtain the sessionKey, anytime a new one gets generated
 * @return {client}        an AppGrid client tied to the given params
 * @example
 * import appgrid from 'appgrid';
 *
 * // when all info is available - use all of it !
 * const client = appgrid({ appKey: 'MY_APP_KEY', deviceId: 'DEVICE_ID', sessionKey: 'SOME_SESSION_KEY' });
 *
 * // when there is no known sessionKey yet
 * const client2 = appgrid({ appKey: 'MY_APP_KEY', deviceId: 'DEVICE_ID' });
 *
 * // when there is no known sessionKey or deviceId yet
 * const client3 = appgrid({ appKey: 'MY_APP_KEY' });
 */
const appgrid = (config) => {
  const { gid, appKey, log = noop, onDeviceIdGenerated = noop, onSessionKeyChanged = noop } = config;
  let { deviceId, sessionKey } = config;
  // First, check the params are OK
  if (!checkUsability(config)) {
    throw new Error('You must provide an appKey | an appKey and a deviceId | an appKey, a deviceId and a sessionKey');
  }
  // Generate a uuid if no deviceId was given
  if (!deviceId) {
    deviceId = appgrid.generateUuid();
    // trigger the callback
    onDeviceIdGenerated(deviceId);
  }

  const stampConfig = { deviceId, gid, appKey, log, onSessionKeyChanged };
  Object.defineProperty(stampConfig, 'sessionKey', {
    set(val) { sessionKey = val; onSessionKeyChanged(val); },
    get() { return sessionKey; }
  });

  return stamp({
    props: { config: stampConfig }
  });
};

/**
 * Generate a UUID.
 *
 * Use this for a device/appKey tuple when you do not have a sessionKey already.
 *
 * This utility method is not used through an appgrid client instance, but available statically
 * @function
 * @return {string} a new UUID
 */
appgrid.generateUuid = () => uuidLib.v4();

/**
 * Returns the range of the current hour of the day, as a string such as '01-05' for 1am to 5 am.
 * Useful for AppGrid log events.
 *
 * This utility method is not used through an appgrid client instance, but available statically
 * @function
 * @return {string} a range of hours
 */
appgrid.getCurrentTimeOfDayDimValue = getCurrentTimeOfDayDimValue;

/**
 * An express-compatible middleware.
 *
 * This uses the cookie-parser middleware, so you can also take advantage of the `req.cookies` array.
 *
 * This middleware takes care of creating an AppGrid client instance for each request automatically.
 * By default, it will also reuse and persist the deviceId and sessionKey using the request and response cookies.
 * That strategy can be changed by passing the optional callbacks,
 * so you could make use of headers or request parameters for instance.
 *
 * Each instance is attached to the response object and available to the next express handlers as `res.locals.appgridClient`.
 *
 * This utility method is not used through an appgrid client instance, but available statically
 * @function
 * @param  {object} config the configuration
 * @param  {string} config.appKey the application Key that will be used for all appgrid clients
 * @param  {function} [config.getRequestInfo] callback that receives the request and returns an object with deviceId and sessionKey properties.
 * @param  {function} [config.onDeviceIdGenerated] callback that receives the new deviceId (if one was not returned by getRequestInfo) and the response
 * @param  {function} [config.onSessionKeyChanged] callback that receives the new sessionKey (anytime a new one gets generated) and the response
 * @param  {function} [config.log] Logging function that will be passed onto the client instance
 * @alias middleware.express
 * @return {function} a middleware function compatible with express
 * @example <caption>Using the default cookie strategy</caption>
 * const appgrid = require('appgrid');
 * const express = require('express');
 *
 * const PORT = 3000;
 *
 * express()
 * // place the appgrid middleware before your request handlers
 * .use(appgrid.middleware.express({ appKey: '56ea6a370db1bf032c9df5cb' }))
 * .get('/test', (req, res) => {
 *    // access your client instance, it's already linked to the deviceId and sessionKey via cookies
 *    res.locals.appgridClient.getEntryById('56ea7bd6935f75032a2fd431')
 *    .then(entry => res.send(entry))
 *    .catch(err => res.status(500).send('Failed to get the result'));
 * })
 * .listen(PORT, () => console.log(`Server is on ! Try http://localhost:${PORT}/test`));
 *
 * @example <caption>Using custom headers to extract deviceId and sessionKey and to pass down any change</caption>
 * const appgrid = require('appgrid_next');
 * const express = require('express');
 *
 * const PORT = 3000;
 * const HEADER_DEVICE_ID = 'X-AG-DEVICE-ID';
 * const HEADER_SESSION_KEY = 'X-AG-SESSION-KEY';
 *
 * express()
 * .use(appgrid.middleware.express({
 *   appKey: '56ea6a370db1bf032c9df5cb',
 *   // extract deviceId and sessionKey from custom headers
 *   getRequestInfo: req => ({ deviceId: req.get(HEADER_DEVICE_ID), sessionKey: req.get(HEADER_SESSION_KEY)}),
 *   // pass down any change on the deviceId (the header won't be set if unchanged compared to the value in getRequestInfo)
 *   onDeviceIdGenerated: (id, res) => res.set(HEADER_DEVICE_ID, id),
 *   // pass down any change on the sessionKey (the header won't be set if unchanged compared to the value in getRequestInfo)
 *   onSessionKeyChanged: (key, res) => res.set(HEADER_SESSION_KEY, key),
 *   log(...args) { console.log(...args) }
 * }))
 * .get('/test', (req, res) => {
 *   res.locals.appgridClient.getEntryById('56ea7bd6935f75032a2fd431')
 *   .then(entry => res.send(entry))
 *   .catch(err => res.status(500).send('Failed to get the result'));
 * })
 * .listen(PORT, () => console.log(`Server is on ! Try http://localhost:${PORT}/test`));
 */
appgrid.middleware = {
  express: factory(appgrid)
};

export default appgrid;