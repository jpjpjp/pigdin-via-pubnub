export default (request) => {
  /** 
  * Client's can call publish.fire to the webex-user-update channel
  * when a new Webex user's info needs to be added, updated or deleted from pubnub.
  * 
  * The object passed in contains the webex user's ID, and for a new user, 
  * access, and refresh tokens need to make Webex API calls on behalf of this user
  * 
  **/
  const pubnub = require('pubnub');
  const kvstore = require('kvstore');
  
  console.log('request',request); //request
  
  let task = JSON.parse(request.params.meta).task;
  let uuid = request.message.userId;
  let token = request.message.access_token;
  let uuidObject = {};
  
  switch(task) {
    case('newUserSetup'):
    console.log(`Setting up platform object data for new user:${uuid}`);
    return newWebexUser(uuid, token, pubnub, kvstore)
    .then((userObject) => {
      uuidObject = userObject;
      console.log('Setting this users tokens in our keystore for future use...');
      return kvstore.set(uuid, request.message);
    }).then(() => {
      // Debugging purpose only
      return kvstore.get(uuid);
    }).then((data) => {
      // Log the debug output
      console.log(`Stored this object in kv:`);
      console.log(data);
      return request.ok(JSON.stringify(uuidObject));
    }).catch((err) => {
      console.error(`Failed setting up a new user: ${err.message}`);
      return request.abort(err.message);
    });
    
    case('addNewSender'):
    uuid = request.message.senderId;
    console.log(`Setting up platform object data for new message sender:${uuid}`);
    return newWebexUser(uuid, token, pubnub, kvstore)
    .then((userObject) => {
      console.log(`Returning serialized version of this user object data:`);
      console.log(userObject);
      return request.ok({message: JSON.stringify(userObject)});
    }).catch((err) => {
      console.error(`Failed setting up a new user: ${err.message}`);
      return request.abort(err.message);
    });
    
    case('deleteUser'):
    console.log(`Attempting to remove user:${uuid} from Pubnub`);
    return kvstore.removeItem(uuid).then(() => pubnub.objects.removeUUIDMetadata({uuid}))
    .then(() => request.ok('{}'))
    .catch((err) => {
      console.error(`Failed deleting user${uuid}: ${err.message}`);
      return request.abort(err.message);
    });
    
    default:
    let msg = `Unknown meta.task value${task}`;
    console.error(msg);
    return request.abort(msg);
    
  }
  
  
};

function newWebexUser(uuid, token, pubnub, kvstore) {
  const xhr = require('xhr');
  
  // Fetch the person info associated with this user's token from webex
  const http_options = {
    "method": "GET",
    "headers": {
      "Authorization": `Bearer ${token}`
    }
  };
  // TODO get this from the KV store in case it changes
  let webexUrl = 'https://webexapis.com/v1/';
  
  return xhr.fetch(`${webexUrl}people/${uuid}`, http_options).then((response) => {
    let personInfo = JSON.parse(response.body);
    console.log(`Fetched Webex person object:`);
    console.log(personInfo);
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
}