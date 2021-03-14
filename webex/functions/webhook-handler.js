// Default skeleton for the REST endpoint function
export default (request, response) => {
  const PubNub = require('pubnub');
  let headersObject = request.headers;
  let paramsObject = request.params;
  let methodString = request.method;
  let bodyString = request.body;
  console.log('request',request); // Log the request envelope passed
  
  // Process webhook payload
  let body = JSON.parse(bodyString);
  console.log(body);
  
  // Query parameters passed are parsed into the request.params object for you.
  // console.log(paramsObject.a) // This would print "5" for query string "a=5"
  // Set the status code - by default it would return 200
  
  
  // See if this is a webhook sent by Webex
  // TODO -- use secret method instead of name
  // TODO -- use KVStore value to check against instead of this hardcoded value
  if ((typeof body === 'object') && (body.name === 'Pubnub Pigden Firehose')) {
    processWebexEvent(body, PubNub).catch((err) =>{
      console.error(`Error processing Webex event: ${err.msg}`);
    });
    // We'll always respond immediately to Webex with a 200 so we don't get disabled
    response.status = 200;
  } else {
    console.error('Webex webhook triggered but body did not include expected fields.  Ignoring.');
    response.status = 401;
  }
  // We'll always respond immediately to Webex with a 200 so we don't get disabled
  return response.send('OK');
  
};


function processWebexEvent(body, PubNub) {
  const kvstore = require('kvstore');
  if (typeof body.data != 'object') {
    return Promise.reject(new Error('Invalid webhook payload.  No data object'));
  }
  let webhookOwner = body.createdBy;
  
  return getUserData(webhookOwner, kvstore).then((userData) => {
    console.log(userData);
    // Process the various types of Webex events
    return processEvent(body, userData, PubNub);
  }).catch((err) => {
    console.log('Failed parsing Webex webhook payload.');
    console.log(err.message);
  });
}


function processNewMessage(userData, message, PubNub) {
  const xhr = require('xhr');
  // Connect as the author of the message
  const pubnub = new PubNub({
    publishKey: "pub-c-c2285e62-264c-43bf-ae9a-e2e415c8cfbc",
    subscribeKey: "sub-c-e7183910-80ee-11eb-bc15-528182b1196d",
    uuid: `${message.personId}`
  });
  
  // Do I need to set up an add listener and wait for a PNConnected event?
  // This seems to work without doing it
  
  // Fetch or setup the object data for the sender and channel and
  // add the sender display name and room title to the message to be published
  let messagePublished = false;
  let normalizedMessage = {
    fromPlatform: "webex",
    senderEmail: message.personEmail,
    html: message.html,
    text: message.text,
    externalObj: message
  };
  
  return updateSenderMetadata(userData, message, pubnub, xhr).then((senderData) =>{
    console.log(senderData);
    normalizedMessage.senderName = senderData.name;
    return updateChannelMetadata(userData, message, pubnub, xhr);
  }).then((channelData) =>{
    normalizedMessage.channelName = channelData.name;
    normalizedMessage.isDirect = channelData.custom.type === "direct" ? true : false;
    console.log(normalizedMessage);
    messagePublished = true;
    return publishWebexMessage(userData, normalizedMessage, pubnub);
  }).catch((err) => {
    if (messagePublished) {
      return Promise.reject(err);
    }
    console.log(`Failed getting sender or webex space details:${err.message}`);
    console.log(`Attempting to publish message without them`);
    return publishWebexMessage(userData, normalizedMessage, pubnub);
  });
  
}

function updateSenderMetadata(userData, message, pubnub, xhr) {
  return pubnub.objects.getUUIDMetadata({uuid: message.personId}).then((response) => {
    console.log('Sender object data exists in pubnub');
    console.log(response);
    return Promise.resolve(response.data);
  }).catch((err) => {
    console.log(`Failed to find existing ojbect data for sender:`);
    console.log(err);
    // if (err.status.statusCode === 404) {...}
    // Oh, this code that works on my node client fails in a function.  Let me inspect the err object
    // console.log(`Failed to find existing ojbect data for sender: ${err}`);
    // console output: "Failed to find existing ojbect data for sender: Error: {\"status\":404,\"error\":{\"message\":\"Requested object was not found.\",\"source\":\"objects\"}}"
    // Oh it seems err is a string not an object, let me parse it
    // let error = JSON.parse(err);
    // Oh, err is a string that starts with the "Error: ", let me strip that
    // let error = JSON.parse(err.replace("Error: ", ""));
    // Oh, err.replace fails let me explicitly find out what err is
    // console.log(typeof err);
    // Oh, its an object, let me try parsing the value of the Error key as a string
    // let error = JSON.parse(err.Error);
    // Oh, it failed to find that key in the err object, let me list the keys
    // console.log(Object.keys(err));
    // console output: []
    // Oh, it has not keys.  I've exhausted my js chops.  Will code this to assume the only possible error is a 404...
    // This is so freaking kludgy...should figure out why it happens
    //if (err.status === 404) {
    
    console.log('New UUID for pubnub, setting up user object data...');
    
    // This was the old way with function chaining, but I can't figure out how to get a response
    // from the function that gets called via the fire.
    //   userData.senderId = message.personId;
    //   return pubnub.fire(
    //     {
    //         message: userData,
    //         channel: 'webex-user-update',
    //         meta: {
    //           task: 'addNewSender'
    //         }
    //     }).then((response) => {
    //       console.log(`New user ${message.personId} object data set`);
    //       console.log(response);
    //       let senderObject = JSON.parse(response);
    //       console.log(senderObject);
    //       return Promise.resolve(senderObject);
    //     });
    
    // Since I couldn't get the response from a chained function that does this
    // I put the REST request here directly.  The limits on this do not seem to be enforced
    // Fetch the person info associated with this user's token from webex
    const http_options = {
      "method": "GET",
      "headers": {
        "Authorization": `Bearer ${userData.access_token}`
      }
    };
    // TODO get this from the KV store in case it changes
    let webexUrl = 'https://webexapis.com/v1/';
    
    return xhr.fetch(`${webexUrl}people/${message.personId}`, http_options).then((response) => {
      let personInfo = JSON.parse(response.body);
      console.log(`Fetched Webex person object:`);
      console.log(personInfo);
      // if user has an avatar include it as the custom element
      let customObj = {};
      if (personInfo.avatar !== undefined) {
        customObj = { avatar: personInfo.avatar };
      }
      // Store the details about the user in an object
      return pubnub.objects.setUUIDMetadata({
        uuid: personInfo.id,
        data: {
          name: personInfo.displayName,
          email: personInfo.emails[0],
          custom: customObj
        }
        
      }).then((response) => {
        console.log(`Update User Object request.status:${response.status}`);
        console.log(response);
        return Promise.resolve(response.data);
      });
    });
    
    // } else {
    //   console.log('Got a non 400 respone on object lookup.  Thats bad!')
    //   return Promise.reject(err);
    // }
  });
}

function updateChannelMetadata(userData, message, pubnub, xhr) {
  const channelId = message.roomId;
  
  return pubnub.objects.getChannelMetadata({channel: channelId}).then((channelObject) => {
    console.log('Channel object data exists in pubnub');
    console.log(channelObject);
    return Promise.resolve(channelObject.data);
  }).catch((err) => {
    console.log(`Failed to find existing object data for channel:`);
    console.log(err);
    // Assuming all errors are 404s since I can't parse the error object?
    console.log('New UUID for pubnub, setting up channel object data...');
    console.log(userData);
    // Feth the person info associated with this user's token from webex
    const token = userData.access_token;
    const http_options = {
      "method": "GET",
      "headers": {
        "Authorization": `Bearer ${token}`
      }
    };
    console.log(http_options);
    // TODO get this from the KV store in case it changes
    let webexUrl = 'https://webexapis.com/v1/';
    
    return xhr.fetch(`${webexUrl}rooms/${channelId}`, http_options).then((response) => {
      // Cleanup debug output by deleting the useless buffer info in the response
      delete response.$buffer;
      console.log(response);
      if (response.status != 200) {
        return Promise.reject(new Error(`Failed request to ${response.url}. ${response.status}:${response.statusText}`));
      }
      let roomInfo = JSON.parse(response.body);
      console.log(`Fetched Webex room object:`);
      console.log(roomInfo);
      // Store the details about the channel in an object
      return pubnub.objects.setChannelMetadata({
        channel: roomInfo.id,
        data: {
          name: roomInfo.title,
          custom: {type: roomInfo.type}
        }
      }).then((response) => {
        console.log(`Update Room Object request.status:${response.status}`);
        console.log(response);
        return Promise.resolve(response.data);
      });
    });
  });
}

function publishWebexMessage(userData, message, pubnub) {
  return pubnub.publish({
    channel: `webex.${userData.userId}.${message.externalObj.roomId}`,
    message
  }).then((result) => {
    console.log(`Published new webex message to webex.${userData.userId}.${message.externalObj.roomId}`);
    // Do I need to disconnect here?  Its not clear HOW from the docs
    // If I don't and no new events happen for this user do I get a presence timeout?
    // pubnub.stop());
    return Promise.resolve(result);
  });
}

function getUserData(id, kvstore) {
  console.log(`Seeing if we know about userId:${id}`);
  return kvstore.get(id).then((data) => {
    if (data === null) {
      return Promise.reject(new Error(`Cannot find webex access token for user:${id}`));
    }
    return Promise.resolve(data);
  });
}

function processEvent(body, userData, PubNub) {
  const xhr = require('xhr');
  // get event content
  var resource = body.resource;
  var event = body.event;
  var data = body.data;
  var actorId = body.actorId;
  
  // TODO get this from the KV store in case it changes
  let webexUrl = 'https://webexapis.com/v1/';
  
  if (typeof resource !== 'string' || typeof event !== 'string') {
    return Promise.reject(new Error('Can not determine webhook type'));
  }
  
  // Set up to fetch the webex object details if needed
  const http_options = {
    "method": "GET",
    "headers": {
      "Authorization": `Bearer ${userData.access_token}`
    }
  };
  console.log(http_options);
  
  // messages
  if (resource === 'messages') {
    // message created
    if (event === 'created') {
      return xhr.fetch(`${webexUrl}messages/${body.data.id}`, http_options).then((msg) => {
        //console.log(msg);
        let message = JSON.parse(msg.body);
        console.log(message);
        return processNewMessage(userData, message, PubNub);
      });
    }
    
    // message deleted
    // if (event === 'deleted') {
    //   framework.myEmit('messageDeleted', data);
    //   return when(true);
    // }
  }
  
  // rooms
  //   if (resource === 'rooms') {
  //     return framework.webex.rooms.get(data.id)
  //       .then(room => {
  
  //         // set room title for rooms with none set (api bug?)
  //         if (room.title == '') {
  //           room.title = 'Default title';
  //         }
  
  //         // room created
  //         if (event === 'created') {
  //           framework.myEmit('roomCreated', room);
  
  //           return framework.onRoomCreated(room)
  //             .catch(err => {
  //               framework.debug(err.stack);
  //               return when(true);
  //             });
  //         }
  
  //         // room updated
  //         if (event === 'updated') {
  //           framework.myEmit('roomUpdated', room);
  
  //           return framework.onRoomUpdated(room)
  //             .catch(err => {
  //               framework.debug(err.stack);
  //               return when(true);
  //             });
  //         }
  
  //       })
  //       .catch(() => {
  //         return when(true);
  //       });
  //   }
  
  // memberships
  //   if (resource === 'memberships') {
  
  //     // membership created
  //     if (event === 'created') {
  //       return framework.webex.memberships.get(data.id)
  //         .then(membership => {
  //           framework.myEmit('membershipCreated', membership);
  
  //           return framework.onMembershipCreated(membership, actorId)
  //             .catch(err => {
  //               framework.debug(err.stack);
  //               return when(true);
  //             });
  //         })
  //         .catch(() => {
  //           return when(true);
  //         });
  //     }
  
  //     // membership updated
  //     if (event === 'updated') {
  //       return framework.webex.memberships.get(data.id)
  //         .then(membership => {
  //           framework.myEmit('membershipUpdated', membership);
  
  //           return framework.onMembershipUpdated(membership)
  //             .catch(err => {
  //               framework.debug(err.stack);
  //               return when(true);
  //             });
  //         })
  //         .catch(() => {
  //           return when(true);
  //         });
  //     }
  
  //     // membership deleted
  //     if (event === 'deleted') {
  //       framework.myEmit('membershipDeleted', data);
  
  //       return framework.onMembershipDeleted(data, actorId)
  //         .catch(err => {
  //           framework.debug(err.stack);
  //           return when(true);
  //         });
  //     }
  
  //   }
  
  // Buttons & Cards Attachment Actions
  //   if (resource === 'attachmentActions') {
  //     // action created
  //     if (event === 'created') {
  //       return framework.webex.attachmentActions.get(data.id)
  //         .then(attachmentAction => {
  //           // We'll emit an event later if we detect a related bot
  //           return framework.onAttachmentActions(attachmentAction)
  //             .catch(err => {
  //               framework.debug(err.stack);
  //               return when(true);
  //             });
  //         })
  //         .catch((e) => {
  //           console.error(`attachmentAction generated error: ${e.massage}`);
  //           return when(true);
  //         });
  //     }
  //   }
  
  return Promise.reject(new Error(`Not set up to handle ${resource} events`));
  
}
