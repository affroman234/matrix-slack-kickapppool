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
let sshKey = 'Private-Lines: 14AAABABpY5fFiq4XWH+Ku/NLGZJ1PMUMpw5R6+q1fhAq5UA6eIU5UGszgATZoM1jQmxiXKEhFmIPidgb6ng0M6Jt1802wh65ZkdfXale3qt5biCXlu2t4Pv5yeFsA0SNsfAnOvko7NUWI+ySPd0pEV42cyKUztyzwQB7JLFv3DPxOtCXpMuxoiUqC7oZvDrAvQvstSkGe0JeGJJ3ic6baI3Xbq+aL+w6YoWnU4uid29I4UGnmLeGv/0wAAmCajKStHdjaGGIQ2aCvsD/KO5lLqTnmn5bXIiRGjyKQQOLIkWhP/tWKmxEJP9aCUSr1CCSZ/M81WHe0swd2vyl+EE0miTjsg4kAAACBAPrFVFQgoOLca5+Lz1gNCMLMi5BYWQGqNzXOM/w/dsqJDkflaQvZJsiiuA2TmQn/KMV9fKqLT2ixfmLOV1+XI/XmzXnf+A2hMc+z0YN9l5/lpEDhjonBK1T7bKJ3iRqhtQugILYA9afpRJ8UkpeG1InrWCBJEflXRVxyVFzCmsSXAAAAgQCIf1F8NpTsOwBV9f6rPlKsYrHq2/poextvBFPIpmINXTnjRXx0iwNmv7PYaQCB3x09uuomD4cNGiQ6WSUpVA46dLFCp3RaEcnuAR8zpXFrjIgAo3yr4UKMIEIRu1gsx1FTmt/5F0xbSFVbSITwJOZpsCC7k3Yxco51bFLFSgFulwAAAIEAm6s2w47ttyqODvcz8CmPmPml4k1qZQrL69roXqnVh0c+fLH49ASHUOzmcaDJPKnB+iBx8yjUDvOeqFTSKGNVZoQKl1ZyRvsHvvUcbgaV81Na+LRtUd5YHg5glBu4zcEx9pbh7QHDunwhXgCl6MmsYtncLiwfCYtmjoPBwdsHp14=Private-MAC: 672d0a626f77db0126b06e890b275f0595f6dd06'

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
