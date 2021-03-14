/*
 * Node utiltity to create a webex user for PubNub
 *
 * This should be run once for each new user before running
 * the pigdin client (node index.js)
 *
 * Usage:
 * node create-user.js path-to-users-json-info
 * 
 * JSON file should include the following
 *   platform: "webex"
 *   userId: webex personId
 *   access_token: webex user's access token
 *   refresh_token: webex user's refresh token
 * 
 * JP Shipherd 3/11/2021 
 */

const PubNub = require('pubnub');
// const userInfo = require('./webex-user.json')
const debugToConsole = true;

if (process.argv.length < 3) {
  console.log('Usage: node delete-user.js path-to-users-json-info')
  process.exit();
}
const userData = process.argv[process.argv.length - 1];
console.log(userData);
const userInfo = require(`./${userData}`);

// Connect to PubNub
// Keys must be associated with a module that
// has the webex connector's active
const pubnub = new PubNub({
  publishKey: "pub-c-c2285e62-264c-43bf-ae9a-e2e415c8cfbc",
  subscribeKey: "sub-c-e7183910-80ee-11eb-bc15-528182b1196d",
  uuid: userInfo.userId,
});

createUser(userInfo);

function createUser(userInfo) {
  console.log(`Attempting to set keys and object data for userId:${userInfo.userId}`);
  pubnub.fire(
    {
        message: userInfo,
        channel: 'webex-user-update',
        meta: {
          task: 'newUserSetup'
        }
    }).then((response) => {
      console.log(`New user ${userInfo.userId} set up in PubNub`);
      debugLog(response);
    }).catch((err) => {
      console.log(`Error setting up new user ${userInfo.userId}: ${err.message}`);
    });
}

function debugLog(msg) {
  if (debugToConsole) {
    console.log(msg)
  }
}

