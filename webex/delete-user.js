/*
 * Node utiltity to delete a webex user from PubNub
 *
 * Usage:
 * node delete-user.js webexUserId
 * 
 * JP Shipherd 3/9/2021 
 */

const PubNub = require('pubnub');
const userInfo = require('./webex-user.json')
const debugToConsole = true;

if (process.argv.length < 3) {
  console.log('Usage: node delete-user.js webexUserId')
  process.exit();
}
const userIdToDelete = process.argv[process.argv.length - 1];

// Connect to PubNub
const pubnub = new PubNub({
  publishKey: "pub-c-c2285e62-264c-43bf-ae9a-e2e415c8cfbc",
  subscribeKey: "sub-c-e7183910-80ee-11eb-bc15-528182b1196d",
  uuid: userInfo.userId,
});

deleteUser(userIdToDelete);

function deleteUser(userId) {
  let userInfo = {userId};
  console.log(`Attempting to delete userId:${userId}`);
  pubnub.fire(
    {
        message: userInfo,
        channel: 'webex-user-update',
        meta: {
          task: 'deleteUser'
        }
    }).then((response) => {
      console.log(`User ${userInfo.userId} object data removed from Pubnub`);
      debugLog(response);
    }).catch((err) => {
      console.log(`Error deleting user ${userInfo.userId}: ${err.message}`);
    });
}

function debugLog(msg) {
  if (debugToConsole) {
    console.log(msg)
  }
}

