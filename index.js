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
let sshKey = `-----BEGIN RSA PRIVATE KEY-----
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
-----END RSA PRIVATE KEY-----`

async function processEvent(event, callback) {
    
    let dbResponse
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
    let promise = new Promise((resolve, reject) => {
        dynamoDB.scan(dbParams, function(err, data) { 
            if (err) {
                console.error(err);
            }
            let matches = {
                servers: [{}],
                filterParams: ''
            }
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
                matches.servers = data.Items;
                for (var serverIndex in matches.servers) {
                    if (commandWords[0] === matches.servers[serverIndex].serverName) {
                        dbResponse = 'Server was found.';
                        if (commandWords[1]) {
                            for (var appPoolIndex in matches.servers[serverIndex].appPools) {
                                if (commandWords[1] === matches.servers[serverIndex].appPools[appPoolIndex]) {
                                    dbResponse += ` Kicking ${commandWords[1]} in ${commandWords[0]}`;

                                    var ssh = new SSH ({
                                        key: sshKey
                                    })
                                    
                                    ssh.exec('uptime', {
                                        out: function(stdout) {
                                            dbResponse += stdout;
                                        }
                                    }).start();

                                    resolve();
                                    return;
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
        })
    })
    
    let response = await promise;
    
    callback(null, dbResponse);
}

exports.handler = (event, context, callback) => {
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? (err.message || err) : JSON.stringify(res, null, "\t"),
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
