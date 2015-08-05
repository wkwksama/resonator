var notifications = require('../platforms/notification');
var errors = require('../util/errors');
var checkEmail = require('../middleware/check_email');
var checkSms = require('../middleware/check_sms');
var checkPushNotification = require('../middleware/check_push_notification');

var routes = {};

module.exports = function(server) {

  server.post('/api/notification/email', checkEmail(), routes.sendEmailNotification);
  server.post('api/notification/sms', checkSms(), routes.sendSmsNotification);
  server.post('api/notification/push', checkPushNotification(), routes.sendPushNotification);
};

routes.sendEmailNotification = function(req, res, next) {

  var identity = req.identity;

  if (!identity) {
    return next(new errors.BadRequestError('Unknown identity'));
  }

  notifications.sendEmail(req.body, function(err, output) {

    if (err) {
      return next(new errors.InternalError('Could not send email to destination'));
    }

    req.log.info({res: output.response}, 'mail_sent');
    res.send(200, output.body);
    return next();
  });
};

routes.sendSmsNotification = function(req, res, next) {

  var identity = req.identity;

  if (!identity) {
    return next(new errors.BadRequestError('Unknown identity'));
  }

  notifications.sendSms(req.body, function(err, response) {

    if (err) {
      return next(new errors.InternalError('Could not send SMS to destination'));
    }

    res.send(200, response);
    return next();
  });
};

routes.sendPushNotification = function(req, res, next) {

  var identity = req.identity;

  if (!identity) {
    return next(new errors.BadRequestError('Unknown identity'));
  }

  notifications.sendPush(req.body, function(err, response) {

    if (err) {
      return next(new errors.InternalError('Could not send PUSH Notification to destination'));
    }

    res.send(200, response);
    return next();
  });
};