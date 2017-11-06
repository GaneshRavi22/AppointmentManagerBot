var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
var https = require('https')
var redisClient = require('redis-js');
var moment = require('moment');
moment.locale('en');

var previousIntent;

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket) {
  socket.on('chat message', function(msg) {
    io.emit('chat message', msg);
    sendToWit(msg);
  });
});

function generateCustomReplyFromBot(intent, data) {
  var fdate;
  if(intent === "AddAppointment") {
    if(data !== null) {
      fdate = moment(data).format('DD-MM-YYYY hh:mm A');
      io.emit('bot message', 'Successfully added a new appointment for ' + fdate);
      addAppointmentToDb(data);
    } else {
      previousIntent = "AddAppointment";
      io.emit('bot message', 'What time will this new appointment be?')
    }
  }
  if(intent === "DeleteAppointment") {
    io.emit('bot message', 'Successfully deleted the appointment for ' + fdate);
    delAppointmentFromDb(data);
  }
  if(intent === "ListAppointment") {
    //io.emit('bot message', 'Listing all the appointments for ' + fdate);
    listAppointmentsFromDb(data);
  }
}

function sendToWit(message) {
  var options = {
    host: 'api.wit.ai',
    port: 443,
    path: '/message?v=' + moment().format('DD/MM/YYYY') + '&q=' + message.toString().trim().replace(/ /g,"%20"),
    method: 'GET',
    headers: {
    Authorization: 'Bearer ZK4PPGK44AFBVDPF373SDWDI523D6EY3',
    accept: 'application/json'
    }
  };

  var x = https.request(options,function(res) {
    res.on('data',function(data) {
          var jsonResponse = JSON.parse(data.toString());
          console.log("Data = " + JSON.stringify(jsonResponse, null, 2));
          if(isEmptyObject(jsonResponse.entities)) {
            console.log("Entities is not defined!");
            io.emit('bot message', 'Sorry, I could not understand. Please tell me whether you would like to add or delete or list your appointments');
            x.end();
            return;
          }
          var intent, datetime;
          // Checking if Intent was inferred by wit.ai
          if(jsonResponse.entities && jsonResponse.entities.intent && jsonResponse.entities.intent[0].value) {
            if(jsonResponse.entities.intent[0].confidence >= 0.50) {
              intent = jsonResponse.entities.intent[0].value;
            } else {
              io.emit('bot message', 'Sorry, I could not understand. Please tell me whether you would like to add or delete or list your appointments');
              x.end();
              return;
            }
          } else {
            intent = previousIntent;
          }
          // Checking if datetime was inferred by wit.ai
          if(jsonResponse.entities && jsonResponse.entities.datetime && jsonResponse.entities.datetime[0].values && jsonResponse.entities.datetime[0].values[0].value) {
            if(jsonResponse.entities.datetime[0].confidence >= 0.50) {
              datetime = jsonResponse.entities.datetime[0].values[0].value;
              generateCustomReplyFromBot(intent, datetime);
            } else {
              generateCustomReplyFromBot(intent, null);
            }
          } else {
            generateCustomReplyFromBot(intent, null); 
          }
    });
  });

  x.end();
}

function addAppointmentToDb(appointmentDateTime) {
  var appointmentDate = moment(appointmentDateTime).format('DD-MM-YYYY');
  var appointmentTime = moment(appointmentDateTime).format('hh:mm A');
  var data = redisClient.get(appointmentDate);
  if(data === null) {
    data = {
      appointmentTimes: []
    };
  } else {
    data = JSON.parse(data);
  }
  data.appointmentTimes.push(appointmentTime);
  redisClient.set(appointmentDate, JSON.stringify(data));
}

Array.prototype.remove = function() {
  var what, a = arguments, L = a.length, ax;
  while (L && this.length) {
      what = a[--L];
      while ((ax = this.indexOf(what)) !== -1) {
          this.splice(ax, 1);
      }
  }
  return this;
};

function delAppointmentFromDb(appointmentDateTime) {
  var appointmentDate = moment(appointmentDateTime).format('DD-MM-YYYY');
  var appointmentTime = moment(appointmentDateTime).format('hh:mm A');
  var data = redisClient.get(appointmentDate);
  if(data === null) {
    return;
  }
  data = JSON.parse(data);
  data.appointmentTimes.remove(appointmentTime);
  redisClient.set(appointmentDate, JSON.stringify(data));
}

function listAppointmentsFromDb(appointmentDateTime) {
  var appointmentDate = moment(appointmentDateTime).format('DD-MM-YYYY');
  var data = redisClient.get(appointmentDate);
  if(data === null) {
    console.log('No appointments');
  } else {
    data = JSON.parse(data);
    io.emit('bot message', 'Appointments on ' + appointmentDate + ' are: ' + data.appointmentTimes);
  }
}

function isEmptyObject(obj) {
  return !Object.keys(obj).length;
}

http.listen(port, function() {
  console.log('listening on *:' + port);
});