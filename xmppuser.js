

var XmppClient = require('node-xmpp-client')
var util = require('util'),
    EventEmitter = require('events')
var logger = require('./logger')

function stringStartsWith (string, prefix) {
    return string.slice(0, prefix.length) == prefix;
}

function XmppUser(jid, password, mobileNumber) {
    this.jid = jid
    this.password = password
    this.mobileNumber = mobileNumber
    this.lastMessageJid=''
    this.isRunning = false;
    this.client =''
    this.loggedOn = false;
    this.devicePresence ={};
    this.resource=''
    EventEmitter.EventEmitter.call(this);

}

util.inherits(XmppUser, EventEmitter.EventEmitter);

XmppUser.prototype.onMessageRecievedCallback = function(message,from,jid) {

}

XmppUser.prototype.onMessageRecieved= function (callback) {
	this.onMessageRecievedCallback = callback
}

XmppUser.prototype.sendMessage= function(message, jid) {
  var self = this
  if (jid)
    toJid = jid
  else
    toJid = self.lastMessageJid

  var reply = new XmppClient.Stanza('message', {
                                  to: toJid,
                                  from: self.jid,
                                  type: 'chat'
                            })
                        reply.c('body').t(message)
                        self.client.send(reply)

}

XmppUser.prototype.disconnect= function () {
      var self = this
      var reply = new XmppClient.Stanza('presence', {                   
                                  type: 'unavailable'
                            })
            
      self.client.send(reply)
      self.client.connection.end();
    }


XmppUser.prototype.shouldSendSMS = function () {
    var self = this
    var status = 1;;
    for (var device in self.devicePresence) {
        if (self.devicePresence.hasOwnProperty(device)) {
            status = status & self.devicePresence[device]
            logger.debug(self.jid+"/"+device+" presence:"+self.devicePresence[device])
        }
    } 

    return status;
    
}

XmppUser.prototype.start= function () {
    var self = this
    self.isRunning = true;

    self.client = new XmppClient({
  			jid: self.jid,
  			password: self.password,
  			reconnect: false
	 })

    self.client.on('stanza', function (stanza) {
    if (stanza.is('presence')) {
      
        //console.log('Received stanza: \n' + stanza.toString()+'\n')
         var type = stanza.attrs.type;
         var from = stanza.attrs.from 
         var to = stanza.attrs.to 
         var id = from.split('/')
         var jid = id[0];
         var resource = id[1];
         var status = stanza.getChild('status') ? stanza.getChild('status').getText() : null
         var show = stanza.getChild('show') ? stanza.getChild('show').getText() : null
         if (jid == self.jid)
         {
          
          if (resource && resource != self.resource)
          {
              if (!stringStartsWith(resource,'jabber_'))
              {
                    logger.info("Not a Jabber resource - ignoring...")
                    return
              }
              else
              {   
                   if (type == 'unavailable' )
                   {
                    logger.info("deleting resource: "+ resource)
                    delete self.devicePresence[resource]
                    return
                   }

                  if (show == 'away' || show == 'xa')
                      self.devicePresence[resource]=1;
                  else
                  {
                     //check to see if we were sending SMS we should send unavaiable on the connection so we don't lose IMs
                      if (self.shouldSendSMS())
                      {
                        logger.info("resetting the connections")
                         var reply = new XmppClient.Stanza('presence', {
                                  from: self.jid,
                                  type: 'unavailable'
                            })
                            self.client.send(reply)

                          var stanza = new XmppClient.Stanza('presence');
            
                              stanza.c('show').t('away');
                              stanza.c('status').t('Mobile SMS');       
                              self.client.send(stanza)
                         
                      }
                      self.devicePresence[resource]=0;
                  }
                  self.emit('presence' ,{'from': from, 'to': to, 'status':status, 'show':show, 'type':type})
              }
          }
         }

    }
  		//console.log('Received stanza: \n' + stanza.toString()+'\n')
  		if (stanza.is('message') && stanza.attrs.type === 'chat') {
   
    	var body = stanza.getChild('body');
                    if(body) {
                        var message = body.getText();
                        var from = stanza.attrs.from;
                        var id = from.split('/')[0];
                        self.lastMessageJid=id
                        self.onMessageRecievedCallback(message,from,id) 
                    }
   
  		}
	})

	self.client.on('online', function () {
  		
      self.resource = self.client.jid.resource;
      logger.info('Client is online: '+self.jid+ ' resource: '+self.resource)

  		var stanza = new XmppClient.Stanza('presence');
  		  stanza.c('show').t('away');
  		  stanza.c('status').t('Mobile SMS');

  		self.client.send(stanza)
      self.loggedOn = true;
      self.emit("LoggedOn")
	})

  
	self.client.on('offline', function () {
  		logger.info('Client is offline: '+self.jid)
      self.loggedOn = false;
	})

	self.client.on('connect', function (e) {
  		logger.info('Client is connected: '+self.jid)
      
	})

	self.client.on('reconnect', function (e) {
  		logger.info('Client reconnects …:'+self.jid)
     
	})

	self.client.on('disconnect', function (e) {
  		logger.info('Client is disconnected: '+self.jid )
      self.loggedOn = false;
    
	})

	self.client.on('error', function (e) {
     
      self.emit("error",e)
  
	})
  self.client.on('end', function (e) {
     logger.info('End: '+self.jid)
     self.emit("end")
     
  
  })

}

XmppUser.prototype.isRunning= function () {
    return this.isRunning
}

module.exports = XmppUser;

