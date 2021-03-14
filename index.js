/*
 * Non GUI based client for testing a Pigdin client
 * built on pubnub
 * 
 * JP Shipherd 3/9/2021 
 */

const {send} = require('process');
const PubNub = require('pubnub');
const debugToConsole = false;

// Used to process user input from the terminal
const readline = require('readline')
// const ac = new AbortController();
// const signal = ac.signal;
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// Load in 3rd party messaging platform users.
// Currently only webex is supported
let messagingIdentities = [];
// Hardcoded for convenience during iterative development
// If you cloned the github repo you will need to create
// this file.  See the "How it works" section in the readme
messagingIdentities[0] = require('./webex/webex-user.json')
if (process.argv.length >= 3) {
  console.log('Using webex user configuration specified on command line...')
  messagingIdentities[0] = require(`./${process.argv[process.argv.length - 1]}`);
}

// Validate that we have at least one valid 3rd party messaging identity
messagingIdentities.forEach((id) => {
  if ((typeof id.userId !== 'string') ||
    (id.platform !== 'webex')) {
    console.error(`Need at least one 3rd party messaging user.`)
    console.error(`Platforms supported: webex`);
    console.error(`Please pass user id json file in.  Format:`)
    console.error(` - platform: 'webex'`)
    console.error(` - userId: platform specific user identifier`)
    process.exit();
  }
});

// Connect to PubNub
// The keys should be associated with an 
// app that have the webex functions running
const pubnub = new PubNub({
  publishKey: "pub-c-c2285e62-264c-43bf-ae9a-e2e415c8cfbc",
  subscribeKey: "sub-c-e7183910-80ee-11eb-bc15-528182b1196d",
  uuid: messagingIdentities[0].userId,
});

// Subscribe to all the platform/user specific channels
messagingIdentities.forEach((id) => {
  // Subscribe to webex messages for this user
  pubnub.subscribe({
    channels: [`webex.${id.userId}.*`],
    withPresence: true
  });
});

let msgCount = 0
// Register a listener for publish events
pubnub.addListener({
  status: function(statusEvent) {
    if (statusEvent.category === "PNConnectedCategory") {
      console.log('Connected to PubNub');
      messagingIdentities.forEach((id) => {
        validateUserExists(id);
      });
      //publishSampleMessage();
    } else {
      console.error(`Unexpected PubNub event:${statusEvent.category}`);
      console.log(statusEvent);
    }
  },
  message: function(messageEvent) {
    // if (msgCount > 0) {
    //   ac.abort();
    // }
    msgCount += 1;
    debugLog(messageEvent);
    displayMessage(messageEvent, msgCount);
    // Eventually we should put the messages in a list
    // Each message will be numbered and users can reply
    // to others than the last by entering "r6 yes", for
    // example to reply yes to the sixth message
  },
  presence: function(presenceEvent) {
    // handle presence
    debugLog(`Presence event:`);
    debugLog(presenceEvent);
  }
})

function displayMessage(messageEvent, count) {
  let msg = messageEvent.message;
  console.log(`\n${count}) ${msg.fromPlatform} message from ${msg.senderName}`);
  console.log(`Channel: ${msg.channelName}:`);
  console.log(`Message: ${msg.text}`);
  collectUserInput(messageEvent);
}

function collectUserInput(messageEvent) {
  // rl.question('\n(r)eply\n', {signal}, userInput => {
  rl.question('\n(r)eply\n', userInput => {
    processUserInput(userInput, messageEvent);
  })
}

function processUserInput(userInput, messageEvent) {
  let inp = userInput.slice(1);
  let msg = messageEvent.message;
  let chan = messageEvent.channel;
  // Note that the channel name format is
  // <platform>.<platform-user-id>.<platform-channel-id>

  // TODO this works when only one platform is supported...
  // Add a quick find the id that matches the fromPlatform
  // attribute when we support more...
  let myInfo = messagingIdentities[0];

  switch(userInput[0]) {
    case('r'):
    case('R'):
      if (inp[0] === ' ') {
        inp = inp.slice(1);
        pubnub.publish({
          uuid: chan.split('.')[1], 
          channel: messageEvent.channel,
          message: {
            text: inp,
            platformChannelId: chan.substr(chan.lastIndexOf(".") + 1),
            channelName: msg.channelName,
            senderName: myInfo.name,
            senderEmail: myInfo.email,
            fromPlatform: msg.fromPlatform,
            forwardToPlatform: true
          },
        });
      } else {
        showInstructions(messageEvent);
      }
      break;

    default:
      showInstructions(messageEvent);
  }
} 

function showInstructions(messageEvent) {
  console.log('Invalid input.  You can enter:')
  console.log(' r a reply - to send "a reply" to the channel of the last received message');
  console.log(messageEvent);
  collectUserInput();  
}


async function publishSampleMessage() {
  debugLog(
    "Since we're publishing on subscribe connectEvent, we're sure we'll receive the following publish."
  );
  const result = await pubnub.publish({
    channel: `${webexUserInfo.userId}.TestSpace`,
    // Chaining example
    // channel: `hello-world`,
    message: {
      fromPlatform: 'test',
      channelName: "greeting",
      senderName: "yourself",
      text: "hello world!",
    },
  });
  debugLog(result);
}

function validateUserExists(userInfo) {
  let platform = userInfo.platform;
  pubnub.objects.getUUIDMetadata({uuid: userInfo.userId}).then((response) => {
    let userObject = response.data;
    userInfo.name = userObject.name; 
    userInfo.email = userObject.email;
    console.log(`Welcome ${userInfo.name}.  Will listen for ${platform} activity for you.`);
    //debugLog(userObject);
  }).catch((err) => {
    debugLog(err);
    if (err?.status?.statusCode === 404) {
      console.log(`Pubnub does not know about this ${platform} user.  Run ${platform}/create-user.js`);
      // console.log('New UUID for pubnub, setting up platform specific info...');
      // console.log('This can also be done by running the create-user.js utility.');
      // pubnub.fire(
      //   {
      //       message: userInfo,
      //       channel: 'webex-user-update',
      //       meta: {
      //         task: 'newUserSetup'
      //       }
      //   }).then((response) => {
      //     console.log(`New user ${userInfo.userId} set up in PubNub`);
      //     debugLog(response);
      //   }).catch((err) => {
      //     console.log(`Error setting up new user ${userInfo.userId}: ${err.message}`);
      //   });
    } else {
      let errMsg = err?.status?.errorData?.error?.message;
      if (typeof errMsg == 'string') {
        console.log(`Can't get user metadata from pubnub: ${errMsg}`)
      }
      console.log(`Without user metadata results may be unexpected...`);
    }
  });
}

function debugLog(msg) {
  if (debugToConsole) {
    console.log(msg)
  }
}

