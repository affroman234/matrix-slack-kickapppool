'use strict';

const awsServerlessExpress = require('aws-serverless-express')
const app = require('./app')
const server = awsServerlessExpress.createServer(app)
const AWS = require('aws-sdk');
const qs = require('querystring');
const node_ssh = require('node-ssh');
const https = require('https');

const kmsEncryptedToken = process.env.kmsEncryptedToken;
let token;
let dbResponse = [];
var dynamoDB = new AWS.DynamoDB.DocumentClient();


async function processEvent(event, callback) {
    
    console.log(event);
    
    let dbResponse = 'Welcome to the Slack-AWS integration.'
    var dynamoDB = new AWS.DynamoDB.DocumentClient();
    
    const params = qs.parse(event.body);
    const requestToken = params.token;
    if (requestToken !== token) {
        console.error(`Request token (${requestToken}) does not match expected`);
        return callback('Invalid request token');
    }

    var message = event.Records[0].Sns.Message;
    const parsedMsg = JSON.parse(message);
    const params = qs.parse(parsedMsg.body);
    console.log(params);
    const requestToken = params.token;
    const responseURL = params.response_url;

    let slackText = params.text;
    let commandWords = slackText.match(/\S+/g);

    if(channel !== '#Devs') {
        callback('Please only use this command in the #Devs channel.')
    }
    
    var dbParams = {
      TableName: 'serverTestList',
      Key: {
          serverName: ''
      }
    }

    let post1 = await httpsPost(responseURL, `${params.user_name} is attempting to kick the app pool.`);

    let promise = new Promise((resolve, reject) => { //use promise because scan is async and lambda will never output otherwise
        let _this = this;
        dynamoDB.scan(dbParams, function(err, data) { 
            if (err) {
                console.error(err);
            }
            let matches = {
                servers: [{}],
                filterParams: ''
            }
            if (commandWords) {
                if (commandWords[0] === 'listPools'){
                    try {
                        if(commandWords.length > 1) {
                            if (commandWords[1].includes('*')) {
                                matches.filterParams = commandWords[1].replace(/\*/g, '');
                                var serverCount = 0;
                                for (var itemIndex in data.Items) {
                                    if (data.Items[itemIndex].serverName.includes(matches.filterParams)) {
                                        matches.servers[serverCount] = data.Items[itemIndex]
                                    serverCount++;
                                    }
                                }
                                dbResponse = matches;
                                resolve(dbResponse);
                                return;
                            }
                        }
                    }
                    catch (error) {
                        console.error(error);
                    }
                    
                dbResponse = data;
                }
                else {
                    matches.servers = data.Items; //keep a local store of the items to reference for kicking commands
                    for (var serverIndex in matches.servers) {
                        if (commandWords[0] === matches.servers[serverIndex].serverName) {
                            dbResponse = 'Server was found.';
                            if (commandWords[1]) {
                                for (var appPoolIndex in matches.servers[serverIndex].appPools) {
                                    if (commandWords[1] === matches.servers[serverIndex].appPools[appPoolIndex]) {
                                        dbResponse += ` Kicking ${commandWords[1]} in ${commandWords[0]}`;
                                        
                                            var ssh = new node_ssh ()
                                            ssh.connect({
                                                host: '18.191.109.135',
                                                username: 'ubuntu',
                                                privateKey: 'id_rsa'
                                            }).then(function() {
                                                ssh.exec('echo $PATH', ['--json'], {
                                                    onStdout(chunk) {
                                                      console.log('stdoutChunk', chunk.toString('utf8'))
                                                      resolve(dbResponse);
                                                      return;
                                                    },
                                                    onStderr(chunk) {
                                                      console.log('stderrChunk', chunk.toString('utf8'))
                                                      resolve(dbResponse);
                                                      return;
                                                    },
                                                  })
                                            }).catch(function(err) {
                                                console.error(err);
                                                return;
                                            }).then(resolve(dbResponse))
                                        return; //only loop necessary amount of times
                                    }
                                    else if (appPoolIndex == (matches.servers[serverIndex].appPools.length-1)) {
                                        dbResponse += 'Please use a valid app pool name. To list pools write /kickapppool listPools.';
                                        resolve(dbResponse);
                                        return;
                                    }
                                }
                            }
                            else {
                                dbResponse = 'Please include an app pool name as the second command. To list pools write /kickapppool listPools.';
                                resolve(dbResponse);
                            }
                            return;
                        }
                        else {
                            dbResponse = 'Server was not found.';
                            resolve(dbResponse);
                        }
                    }
                }
                resolve(dbResponse);
            }
        })
    }).then((dbResponse) => {
        return httpsPost(responseURL, dbResponse);
    }).then(() => {
        console.log('Finished all.')
    })
    
    let response = await promise;
}

async function httpsPost(url, message) {
    
    let promise = new Promise((resolve, reject) => {
        
        /* let urlNew = url.substr(8,15);
        console.log('url: ' + urlNew)
        
        let pathNew = url.substr(23,70);
        console.log('path: ' + pathNew) */

        // use those ^^ if you want to always respond to the person who sent the message. the same channel

        console.log('message: ' + message)
        
        var postData = JSON.stringify({
            "text": message
        });
        var options = {
                host: 'hooks.slack.com',
                path: '/services/T0P79CK26/BC3LPHTFU/GZiyQG5qMZqCMgTOg7scMJ1l', //slack webhook endpoint for specific channel
                method: 'POST',
                // ciphers: 'DES-CBC3-SHA',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }
        var req = https.request(options, (res) => {
          console.log('statusCode:', res.statusCode);
          console.log('headers:', res.headers);
        
          res.on('data', (d) => {
            process.stdout.write(d);
            resolve();
          });
        });
        
        req.on('error', (e) => {
          console.error(e);
          reject();
        });
        
        req.write(postData);
        req.end(); 
    }).then(() => {
        console.log('Finished.');
    });
    
    return promise;
}

exports.handler = (event, context, callback) => {
    var ddb = new AWS.DynamoDB({params: {TableName: 'snslambda'}});
    var SnsMessageId = event.Records[0].Sns.MessageId;
      var SnsPublishTime = event.Records[0].Sns.Timestamp;
      var SnsTopicArn = event.Records[0].Sns.TopicArn;
      var LambdaReceiveTime = new Date().toString();
      var itemParams = {Item: {SnsTopicArn: {S: SnsTopicArn},
      SnsPublishTime: {S: SnsPublishTime}, SnsMessageId: {S: SnsMessageId},
      LambdaReceiveTime: {S: LambdaReceiveTime}  }};
      /* ddb.putItem(itemParams, function() {
        context.done(null,'');
      }); */ 
      
    processEvent(event);
};