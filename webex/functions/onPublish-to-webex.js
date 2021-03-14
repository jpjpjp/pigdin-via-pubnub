export default (request) => {
  /** 
  * Messages published to the webex-publish channel will be intercepted
  * by this function which will send the message to webex using the 
  * userId and channel info.
  * 
  **/
  const pubnub = require('pubnub');
  const kvstore = require('kvstore');
  
  console.log('request',request); //request
  
  let uuid = request.publisher;
  let roomId = request.message.platformChannelId;

  return getUserData(uuid, kvstore).then((keys) => {
    return postMessage(key.access_token, roomId, request.message);
  }).then(() => {
    return request.ok();
  }).catch((err) => {
    console.log(`Publish to webex failed: ${err.message}`);
    return request.abort();
  })
};

function getUserData(id, kvstore) {
  console.log(`Seeing if we know about userId:${id}`);
  return kvstore.get(id).then((data) => {
    if (data === null) {
      return Promise.reject(new Error(`Cannot find webex access token for user:${id}`));
    }
    return Promise.resolve(data);
  });
}

function postMessage(token, roomId, msg);{
  const xhr = require('xhr');
  
  // Fetch the person info associated with this user's token from webex
  const http_options = {
    "method": "POST",
    "headers": {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    "body": {
      roomId,
      text: msg.text
    }
  };
  // TODO get this from the KV store in case it changes
  let webexUrl = 'https://webexapis.com/v1/';
  
  return xhr.fetch(`${webexUrl}messages`, http_options).then((response) => {
    let message = JSON.parse(response.body);
    console.log(`Published message to webex:`);
    console.log(message);
    return Promise.resolve(message);
    }).then((response) => {
      console.log(`Update User Object request.status:${response.status}`);
      console.log(response);
      return Promise.resolve(new Error(JSON.stringify(response.data)));
    });
}