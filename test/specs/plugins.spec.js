import chai from 'chai';
import clientStamp from '../../src/client';

chai.should();

describe('Plugins API Tests', () => {
  const client = clientStamp({
    appKey: '56ea6a370db1bf032c9df5cb',
    uuid: 'gregTestingSDK'
  });

  it('getAllEnabledPlugins should return an array from AppGrid', () => {
    return client.getAllEnabledPlugins()
      .then((plugins) => {
        plugins.should.be.an('array');
      });
  });
});
