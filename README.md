# Pigdin via Pubnub

This project was my first attempt to "build something" with Pubnub.   Back in the early days of instant messaging their were a few dominant platforms, AOL Instant Messenger and Yahoo.   Pigdin was an IM "meta client" that provided a single interface which allowed a user to send and receive messages for both systems with a single client.

Today (2021) we have a similar non-homogenous messaging ecosystem.  Many of us have our primary (work) messaging system, but have occasional contact with people who prefer to use a different messaging system.  My goal with this project was to see if it was possible to create a "Pigdin" for the modern messaging ecosystem.

My company uses Slack as our primary messaging system, but I occasionally need to interact with people using Webex, MS Teams, Whats App, and Facebook messenger.   Since I'm most familiar with Webex developer interfaces I chose to initially add support for Webex to Pigdin via Pubnub.

## How it works

I'm not a strong front end developer so I chose to initially build a simple cmd line client in node. Before the app can be used, a webex user needs setup Pigdin so that it has permission to register to be notified when the user gets new messages and webex and so that it can send webex messages on that user's behalf.

Since I was eager to focus on the PubNub functionality I chose to bypass the necessary step of creating an OAuth client that would allow Pigdin users to authorize it to make requests on behalf of users to the target platforms.  Instead this initial version requires that a Webex user has created their own OAuth client and has obtained an access and refresh token needed for a third party to act on that user's behalf.   With these in hand the webex user can create a json file with the following attributes:

```json
  "platform": "webex",
  "userId": "webex user Id string",
  "access_token": "webex OAuth2 access token",
  "refresh_token" "webex OAuth2 refresh token"
```

Once, this JSON is available, a user can run the following script to register the user in Pigdin:

  `node webex/create-user.js user-info.json`

After the user is setup, that app can be started with the following command:

  `node index.js webex-user-id`

![Watch the video](./docs/pigdin-demo.gif)

## Its all about the functions

Most of the "smarts" for this app are implemented in pubnub functions.   There is no traditional server side component to this app  (although one would eventually be necessary in order to support proper OAuth logins and security).

To run this app yourself you'll need to create a module associated with your keyset(s) and configure the following functions:

### [onFire-newUser-method.js](./webex/functions/onFire-newUser-method.js)

This is an "Before Fire or Publish" function associated with the channel "webex-user-update".  Clients can post a message to this function via the `pubnub.fire()` method.  It expects a message that includes a `meta` param set to one of the following:

- newUserSetup - This expects a message with a user's OAuth credentials as described above.  It checks if UUID object meta data is already available for this user and if so returns it.  If not it validates the user's credential and stores it in KV storage for future use as well as setting up the user's object meta data.  TODO: It should create the webhook for new events.  At this time I don't know how to programatically discover what the URL associated with the modules On Request function(s) are.
- addNewSender - This will query webex for the user data associated with a userId that has sent a message to any registered user, and store the infomation in the UUID object metadata.
- deleteUser - This will delete any object metadata and (if they exist) any OAuth tokens in the KV store for the user.  TODO: If OAuth tokens are available, the webhook for this user should be deleted as well.

### [webex-handler.js](./webex/functions/webex-handler.js)

This is an On Request function to process any webex webhook events.  It currently handles only new message events, but may eventually update object metadata based on room and membership events.

When a new message event is received, it first fetchs the auth tokens associated with the webhook's creator to send a GET request to the webex /messages API in order to get the decrypted content of the message.  Once this is received the function publishes the messages to the pubnub channel webex.[userId].[roomId]

### [onPublish-to-webex.js](./webex/functions/onPublish-to-webex.js)

This is a "Before Fire or Publish" function associated with the channel "webex.*".  When a Pigdin client user replies to a message sent by a webex user it is published to the channel webex.[userId].[roomId] and includes in the payload of the message a key "forwardToPlatform" which is set to true.

This function inspects the message for this key as well as the key/value pair `"fromPlatform": "webex"`.  When these keys exist, the forwardToPlatform key is deleted, the OAuth key associated with the publisher is fetched from the KV store, and a POST requests is sent to the webex /messages api to send the message text to the appropriate webex roomId.

## The client(s)

### [create-user](webex/create-user.js)

This utility simply calls `pubnub.fire()` with the details of a webex user's identity and OAuth tokens on with the meta data set to "newUser.  

### [delete-user](webex/delete-user.js)

This utility simply calls `pubnub.fire()` with the details of a webex user's identity and OAuth tokens on with the meta data set to "deleteUser.

### [index.js](./index.js)

This is the main command line interface.  It is designed to eventually support multiple messaging platforms but currently supports only webex.

On startup it reads in the webex user's identity and verifies that PubNub has object metadata associated with that user.   After that it subscribes to the channel webex.[userId].*.

Whenever a new message is received it outputs the details about the message including the platfrom it came from, the name of the sender and the channel, and the text associated with the message.

If the user chooses to reply, the reply is posted back to the same PubNub channel which will trigger the logic in the onPublish-to-webhook function which also posts the message to webex on the user's behalf.

## To Do

- [x] Enable replies from the client, ie Add "(r)eply" after each message.
- [ ] Store all messages and enable replies to any numbered message.  Ie: "r12 hi there" would send "hi there" to the channel that the 12th message was in.
- [ ] Use history to request a list of the previous messages in the channel, ie "(p)revious messages", will look in history and show the last 10 messages for the channel of the current message.
- [ ] Use objects to provide more info about the sender, ie "(s)ender info"
- [ ] Use membership objects to allow user to query for channel membership.
- [ ] Create an onInterval method that "walks" the users every week or so and refreshes the tokens.  This might require some way of keeping track of all the user id indexes.
- [ ] Create the webex webhook in 
- [ ] Add more than just webex.  I'd like facebook messenger, whats app, and ms teams, but need to figure out if they have APIs and how much more work it will be.  (Maybe this can be a hackathon project in the future)
- [ ] Need to think through security.  The first time a user joins the app they need to provide the OAuth tokens of webex.  The app will periodically refresh these so the user can't provide them on subsequent logins.  Is this an area that PAM could help?  (These don't feel like real security tokens for me).   A workaround for webex could be to look at the refresh token which doesn't generally change, but I suspect that isnt cross planform enough.
