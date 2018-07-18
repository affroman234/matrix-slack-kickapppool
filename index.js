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

function processEvent(event, callback) {
    
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
    
    if (commandWords[0] === 'listPools'){
        dynamoDB.scan(dbParams, function(err, data) {
            if (err) {
                console.error(err);
            }
            // if (commandWords[1].includes('*')) {
            // let filterParams = commandWords[1].replace(/\*/g, '');
                /* let matches = {
                    servers: [],
                    pools: []
                }
                for (var itemIndex in data.Items) {
                    matches.servers.push(data.Items[itemIndex].serverName.includes(filterParams));
                        for (var poolIndex in item.appPools) {
                            matches.pools.push(item.appPools[poolIndex].includes(filterParams));
                    }
                }
                dbResponse = matches;
                return;
        } */
            dbResponse = data;
        })   
    }
    callback(null, dbResponse, resetdb);
}

function resetdb () {
    dbResponse = []; 
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
