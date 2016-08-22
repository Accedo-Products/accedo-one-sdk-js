import stampit from 'stampit';
import sessionStamp from './session';
import { grab, post } from '../apiHelper';

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

/**
 * @function client
 */
const stamp = stampit()
.methods({
  /**
   * Get all the application-scope data for a given user
   * @param {string} userName an appgrid user
   * @return {promise}  a promise of the requested data
   * @memberof client
   */
  getAllApplicationScopeDataByUser(userName) {
    return getAllDataByUser.call(this, APPLICATION_SCOPE, userName);
  },

  /**
   * Get all the application-group-scope data for a given user
   * @param {string} userName an appgrid user
   * @return {promise}  a promise of the requested data
   * @memberof client
   */
  getAllApplicationGroupScopeDataByUser(userName) {
    return getAllDataByUser.call(this, APPLICATION_GROUP_SCOPE, userName);
  },

  /**
   * Get all the application-scope data for a given user and data key
   * @param {string} userName an appgrid user
   * @param {string} key a key to specify what data to obtain
   * @return {promise}  a promise of the requested data
   * @memberof client
   */
  getApplicationScopeDataByUserAndKey(userName, key) {
    return getDataByUserAndKey.call(this, APPLICATION_SCOPE, userName, key);
  },

  /**
   * Get all the application-group-scope data for a given user
   * @param {string} userName an appgrid user
   * @param {string} key a key to specify what data to obtain
   * @return {promise}  a promise of the requested data
   * @memberof client
   */
  getApplicationGroupScopeDataByUserAndKey(userName, key) {
    return getDataByUserAndKey.call(this, APPLICATION_GROUP_SCOPE, userName, key);
  },

  /**
   * Set the application-scope data for a given user
   * @param {string} userName an appgrid user
   * @param {object} data the data to store
   * @return {promise}  a promise of the requested data
   * @memberof client
   */
  setApplicationScopeUserData(userName, data) {
    return setUserData.call(this, APPLICATION_SCOPE, userName, data);
  },

  /**
   * Set the application-group-scope data for a given user
   * @param {string} userName an appgrid user
   * @param {object} data the data to store
   * @return {promise}  a promise of the requested data
   * @memberof client
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
   * @memberof client
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
   * @memberof client
   */
  setApplicationGroupScopeUserDataByKey(userName, key, data) {
    return setUserDataByKey.call(this, APPLICATION_GROUP_SCOPE, userName, key, data);
  }
})
// Make sure we have the sessionStamp withSessionHandling method
.compose(sessionStamp);

export default stamp;
