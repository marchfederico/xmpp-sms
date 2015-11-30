var express = require('express');
var https = require('https');
var http = require('http');
var fs = require('fs');
var bodyParser = require("body-parser")
var request = require('request')
var logger = require('./logger')
var XmppUser = require('./xmppuser.js')
var tropowebapi = require('tropo-webapi');

var options = {
    key: fs.readFileSync('server.key', 'utf8'),
    cert: fs.readFileSync('server.crt', 'utf8'),
    ciphers: 'ECDHE-RSA-AES128-SHA256:AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0" // Avoids DEPTH_ZERO_SELF_SIGNED_CERT error for self-signed certs

var gUsers={}
var gToken = process.env.TROPO_API_KEY
var gSMSNumber = process.env.TROPO_PHONE_NUMBER


function sendSMS(message, number, from, token)
{
  var msg = encodeURI(message)
  var path =  '/1.0/sessions?action=create&token=' + token + '&msg=' + msg + '&number=' + number + '&from=' + from + '&type=SMS';

  request({url:'http://api.tropo.com'+path, jar:true}, function (error, response, body) {  
      if (!error) {
        logger.debug(body)
      }
      else
      {
        logger.error(error)
      } 
  })

}



var app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json())
app.use(express.static('public'));

app.get('/ping',function(req, res) {
  res.end('pong')
})


app.post('/logout',function(req, res){
  var body = req.body
  var mobileNumber = body.mobileNumber

   if (gUsers[mobileNumber])
   {
      var x = gUsers[mobileNumber]
      x.client.disconnect()
      delete gUsers[mobileNumber]
      res.end('service stopped for mobile:'+mobileNumber)
  }
  else
  {
    res.end('mobile number not registered')
    logger.warn("mobile number not registered: "+mobileNumber)
  }
})

app.post('/login',function(req, res){
  var body = req.body
  var mobileNumber = body ? body.mobileNumber :null
  var jid = body ? body.jid : null
  var password = body ? body.password : null
  
  if (mobileNumber && gUsers[mobileNumber])
  {
    res.end('already logged in')
    return
  }
  else if (jid && password && mobileNumber)
  {
  var xuser = new XmppUser(jid, password, mobileNumber);
      xuser.firstTime = true;
      xuser.onMessageRecieved(function(message,from,jid) {
        if (xuser.shouldSendSMS())
        {
            logger.debug("sending sms message from: "+jid+" to: "+xuser.mobileNumber)
            sendSMS(jid+"->"+message, xuser.mobileNumber, gSMSNumber, gToken)
        }
        else
        {
          logger.debug("ignoring message from "+jid+" to:"+xuser.mobileNumber)
        }
      })

  xuser.on("LoggedOn",function()
  { 
    if (xuser.firstTime)
    {    
          res.end('logged in')
          gUsers[mobileNumber] = {jid: jid, password: password, client:xuser}
          xuser.client.connection.reconnect = true;
          xuser.firstTime = false;

    }
    else
    {

      // do nothing
    }
    
  })

  xuser.on("error",function(e)
  {
    logger.error(e)
    if (xuser.firstTime)
    {
         res.end(e.toString())
         xuser.firstTime = false;
    }
  })

  xuser.on("presence", function(p){

      logger.debug("received presence from:"+p.from+" to:"+p.to+" status:"+p.status+" show:"+p.show+" type:"+p.type)


  })

  xuser.on("end",function(e){
    delete xuser.client
    delete xuser
  })

  //Try and login
  xuser.start()
  
  
}
else
{

  res.end('Invalid JID, Password or Mobile Number')
}

})

app.post('/troposms',function(req, res){
   
   
    var room = null
    var body = req.body
    var tropo = new tropowebapi.TropoWebAPI(); 
   
   // Render out the JSON for Tropo to consume.
    res.writeHead(200, {'Content-Type': 'application/json'});
   

    var message =''

     if (body && body.session)
     {
         if (body.session.from) // check to see if it is an incoming call or SMS
         {
           if (body.session.from.channel == 'VOICE')
           {
             tropo.say('Sorry this number only supports SMS'); // just say something in case someone calls
            }
            else
            {
               tuser = gUsers[body.session.from.id] // check to see if the number maches one of the logged on users
               if (tuser) 
               {
                    if (tuser.client.lastMessageJid)
                    {  
                      logger.debug("received sms from: "+body.session.from.id + " sending to: "+tuser.jid)
                      tuser.client.sendMessage(body.session.initialText) // send the IM
                    }
                    else
                    {
                      logger.info("Session just initialized for "+tuser.jid)
                    }
                }
                else
                  logger.warn("unknown user "+ body.session.from.id)
            }

            res.end(tropowebapi.TropoJSON(tropo)); //response to the request

        }
        else // it is the request to send an SMS
        {

            var to = body.session.parameters.number
            var msg = body.session.parameters.msg
            var from = body.session.parameters.from
            var type = body.session.parameters.type;
            var smsDoc = {
              "tropo": [
                {
                  "message": {
                      "say": {
                          "value": msg
                      },
                      "to": to,
                      "from": from,
                      "network": type
                  }
                }
              ]
            }
            
            
            res.end(JSON.stringify(smsDoc,null,2)) // response to the request
        }

    }

})

// Create an HTTP service.
http.createServer(app).listen(9998);
// Create an HTTPS service identical to the HTTP service.
//https.createServer(options, app).listen(9998);






