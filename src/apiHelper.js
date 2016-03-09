import fetch from 'isomorphic-fetch';
import qs from 'qs';

const MIME_TYPE_JSON = 'application/json';
const credentials = 'same-origin'; // NOTE: This option is required in order for Fetch to send cookies
const defaultHeaders = { accept: MIME_TYPE_JSON };

const extractJsonAndAddTimestamp = (response) => {
  const time = Date.now();
  return response.json()
    .then((json) => {
      if (json.error) { throw new Error(`AppGrid GET Request Error. Code: ${json.error.code} Message: ${json.error.message}. Status: ${json.error.status}`); }
      return { time, json };
    });
};

const getForwardedForHeader = ({ clientIp }) => {
  if (!clientIp) { return {}; }
  return { 'X-FORWARDED-FOR': clientIp };
};

const getSessionHeader = ({ sessionId }) => {
  if (!sessionId) { return {}; }
  return { 'X-SESSION': sessionId };
};

const getNoCacheHeader = ({ noCache }) => {
  if (!noCache) { return {}; }
  return { 'X-NO-CACHE': 'true' };
};

const getContentTypeHeader = () => ({ 'Content-Type': MIME_TYPE_JSON });

const getQueryString = (options, existingQs = {}) => {
  const defaultQs = {
    appKey: options.appId,
    uuid: options.uuid
  };
  if (options.gid) { defaultQs.gid = options.gid; }
  const qsObject = { ...existingQs, ...defaultQs };
  const queryString = qs.stringify(qsObject);
  return queryString;
};

const getRequestUrlWithQueryString = (url, options) => {
  const splitUrl = url.split('?');
  const urlWithoutQs = splitUrl[0];
  const existingQs = qs.parse(splitUrl[1]);
  const queryString = getQueryString(options, existingQs);
  return `${urlWithoutQs}?${queryString}`;
};

const getExtraHeaders = (options) => {
  return { ...getForwardedForHeader(options), ...getSessionHeader(options), ...getNoCacheHeader(options) };
};

export const grab = (url, options) => {
  const headers = { ...defaultHeaders, ...getExtraHeaders(options) };
  const requestUrl = getRequestUrlWithQueryString(url, options);
  options.debugLogger(`Sending a GET request to: ${requestUrl}. With the following headers: `, headers);
  return fetch(requestUrl, { credentials, headers })
    .then(extractJsonAndAddTimestamp)
    .then((response) => {
      options.debugLogger('GET response: ', response);
      return response;
    });
};

export const post = (url, options, body = {}) => {
  const headers = {
    ...defaultHeaders,
    ...getContentTypeHeader(),
    ...getExtraHeaders(options)
  };
  const requestUrl = getRequestUrlWithQueryString(url, options);
  options.debugLogger(`Sending a POST request to: ${requestUrl}. With the following headers and body: `, headers, body);
  const requestOptions = {
    headers,
    credentials,
    method: 'post',
    body: JSON.stringify(body)
  };
  return fetch(requestUrl, requestOptions)
    .then(({ status, statusText }) => {
      if (status !== 200) { throw new Error(`AppGrid POST request returned a non-200 response. Status Code: ${status}. Status Text: ${statusText}`); }
      const result = { status, statusText };
      options.debugLogger('POST response: ', result);
      return result;
    });
};
