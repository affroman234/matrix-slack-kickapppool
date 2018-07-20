'use strict';

const awsServerlessExpress = require('aws-serverless-express')
const app = require('./app')
const server = awsServerlessExpress.createServer(app)
const AWS = require('aws-sdk');
const qs = require('querystring');
const SSH = require('simple-ssh');

const kmsEncryptedToken = process.env.kmsEncryptedToken;
let token;
let dbResponse = [];
var dynamoDB = new AWS.DynamoDB.DocumentClient();
let sshKey = process.env.ssh;

async function processEvent(event, callback) {
    
    let dbResponse = 'Welcome to the Slack-AWS integration.'
    var dynamoDB = new AWS.DynamoDB.DocumentClient();
    
    const params = qs.parse(event.body);
    const requestToken = params.token;
    if (requestToken !== token) {
        console.error(`Request token (${requestToken}) does not match expected`);
        return callback('Invalid request token');
    }

    let user = params.user_name;
    let command = params.command;
    let channel = params.channel_name;
    let slackText = params.text;
    let commandWords = slackText.match(/\S+/g);
    
    var dbParams = {
      TableName: 'serverTestList',
      Key: {
          serverName: ''
      }
    }
    let promise = new Promise((resolve, reject) => { //use promise because scan is async and lambda will never output otherwise
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
                        resolve();
                        return;
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
                                        
                                        console.log(process.env.ssh);
                                        var ssh = new SSH ({
                                            key: sshKey //key needs to be in column format
                                        })
                                        
                                        ssh.exec('uptime', {
                                            out: function(stdout) {
                                                dbResponse += stdout;
                                            }
                                        }).start();
    
                                        resolve();
                                        return; //only loop necessary amount of times
                                    }
                                    else if (appPoolIndex == (matches.servers[serverIndex].appPools.length-1)) {
                                        dbResponse += 'Please use a valid app pool name. To list pools write /kickapppool listPools.';
                                        resolve();
                                        return;
                                    }
                                }
                            }
                            else {
                                dbResponse = 'Please include an app pool name as the second command. To list pools write /kickapppool listPools.';
                                resolve();
                            }
                            return;
                        }
                        else {
                            dbResponse = 'Server was not found.';
                            resolve();
                        }
                    }
                }
                resolve();
            }
        })
    })
    
    let response = await promise;
    
    callback(null, dbResponse);
}

exports.handler = (event, context, callback) => {
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? (err.message || err) : JSON.stringify(res, null, "\t"), //format response with tabs
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (token) {
        // Container reuse, simply process the event with the key in memory
        processEvent(event, done);
    } else if (kmsEncryptedToken && kmsEncryptedToken !== '<kmsEncryptedToken>') {
        const cipherText = { CiphertextBlob: new Buffer(kmsEncryptedToken, 'base64') };
        const kms = new AWS.KMS();
        kms.decrypt(cipherText, (err, data) => {
            if (err) {
                console.log('Decrypt error:', err);
                return done(err);
            }
            token = data.Plaintext.toString('ascii');
            processEvent(event, done);
        });
    } else {
        done('Token has not been set.');
    }
};
