var request = require('request');
var twilio = require('twilio');
var async = require('async');
var config = require('config');
var gcm = require('../util/gcm');
var apn = require('../util/apn');
var identity = require('../platforms/identity');
var errors = require('../util/errors');

var services_config = require( process.cwd() + '/config/external_services');
var TWILIO_ACCOUNT_SID = services_config.twilio.account_sid;
var TWILIO_AUTH_TOKEN = services_config.twilio.auth_token;

if (process.env.NODE_ENV === 'test') {
  TWILIO_ACCOUNT_SID = "Some_random_account_sid";
  TWILIO_AUTH_TOKEN = "Some_random_auth_token";
}

messager = new twilio.RestClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

module.exports = {
  sendEmail: sendEmailNotification,
  sendSms: sendSmsNotification,
  sendPush: sendPushNotification
};

function sendEmailNotification(body, callback) {

  var MAILGUN_MESSAGES_URL = 'https://api.mailgun.net/v3/' + services_config.mailer.mailgun.domain + '/messages';

  if (process.env.NODE_ENV === 'test') {
    MAILGUN_MESSAGES_URL = 'https://api.mailgun.net/v3/' + config.get('external.mailer.mailgun.domain') + '/messages';
  }

  // Format email object
  var data = {
    to: body.to,
    from: body.from,
    subject: body.subject,
    html: body.message
  };

  request({
    url: MAILGUN_MESSAGES_URL,
    method: 'POST',
    json:true,
    auth: {
      user: 'api',
      pass: services_config.mailer.mailgun.apiKey,
      sendImmediately: true
    },
    formData: data

  }, function (err, response, body) {

    if(err) {
      return callback(err);
    }

    var output = {
      response: response,
      body: body
    };

    return callback(null, output);
  });
}

function sendSmsNotification(body, callback) {

  var messageCounter = 0;
  async.forEachSeries(body.to, function(destination, done) {

    // Format sms object
    var sms = {
      to: destination,
      from: body.from,
      body: body.message
    };

    messager.sendSms(sms, function(err) {

      if (err) {
        return done(err);
      }
      messageCounter++;
      return done();
    });
  }, function(err) {
    console.log('SMS', err);

    if (err) {
      return callback(err);
    }

    return callback(null, {"messages": messageCounter, "targets": body.to, "source": body.from, "text": body.message});
  });
}

function sendPushNotification(body, callback) {

  var to = body.to;
  var data = body.message;

  var options = {onlyApn: true, onlyGcm: true};

  if(body.options){

    if (body.options.onlyApn && body.options.onlyGcm) {

      console.log('Notification not sent: onlyApn & onlyGcm both set at true');

      return callback(new errors.BadRequestError('onlyApn & onlyGcm both set at true.'));
    } else if (body.options.onlyGcm) {

      options.onlyApn = false;
    } else if (body.options.onlyApn ) {

      options.onlyGcm = false;
    }
  }

  var onlyGcm = options.onlyGcm;
  var onlyApn = options.onlyApn;

  var deviceTokens = [];
  var regIds = [];

  async.forEachSeries(to, function(identityId, done){

    identity.get(identityId, function(err, identityDB){

      if (err) return done(err);

      deviceTokens = deviceTokens.concat(identityDB.devices.apn);
      regIds = regIds.concat(identityDB.devices.gcm);

      done();
    });
  }, function(err) {

    if (err) return callback(err);

    var sent = {
      "GCM": [],
      "APN": []
    };

    async.parallel([

      function(done) {

        if ( onlyGcm ) {

          console.log('Sending PUSH to GCM[' + regIds + ']');

          sent.GCM = sent.GCM.concat(regIds);

          gcm.sendGCM(regIds, data, {}, done);
        } else {

          done();
        }
      },
      function(done) {

        if ( onlyApn ) {

          console.log('Sending PUSH to APN[' + deviceTokens + ']');

          sent.APN = sent.APN.concat(deviceTokens);

          apn.pushNotification(deviceTokens, data, body, done);
        } else {

          done();
        }
      }
    ], function(err){

      if (err) return callback(err);

      return callback(null, sent);
    });
  });
}