var WebSocketServer = require('websocket').server;
var http = require('http');
var connections = [];
var server = http.createServer(function(request, response) {
	//process HTTP request. Since we're writing just WebSockets server
        // we don't have to implement anything.

});
server.listen(1337,function(){});

wsServer = new WebSocketServer({
	httpServer: server
});

wsServer.on('request', function(request) {
	var connection = request.accept(null, request.origin);
	connections.push({id: '', pseu: '', socket: connection});
	console.log("Server: New peer is connected!");

	//we'll handle all messages from users here
	connection.on('message', function(message) {
		if (message.type === 'utf8') {
			var msg = JSON.parse(message.utf8Data);
			var caller = msg.caller;
			var callee = msg.callee;
			var callerpseu = msg.callerpseu;
			if(msg.data.type === 'join') {
				for(var i=0; i<connections.length; i++) {
					// Associate Socket <-> ID
					if(connections[i].socket === connection) {
						connections[i].id = caller;
						connections[i].pseu = callerpseu;
						console.log("Server: <"+ caller +"> has been associated to a socket");
					}
					// Send information about other peer connected
					else {
						console.log("Server: Inform <" + connections[i].id + "> about new peer <" + caller + ">");
                        			connections[i].socket.send(message.utf8Data);
						console.log("Server: Inform <" + caller + "> about connected <" + connections[i].id + ">");
						//Send to this peer all others connections
						var msg = {
						    data: {
							type: 'already_joined'
						    },
						    callee: caller,
						    caller: connections[i].id,
						    callerpseu: connections[i].pseu
						};
						connection.send(JSON.stringify(msg));
					}
				}
			}
			else {
				//Send a message to a specific user
				if(callee !== 'all') {
				    for (var i = 0; i < connections.length; i++) {
					if(connections[i].id === callee) {
					    console.log("Server: Send message <"+ msg.data.type +"> to <" + connections[i].id + ">");
					    connections[i].socket.send(message.utf8Data);
					    break;
					}
				    }
				}
				else {
				    //send message to all others users except the issuer
				    console.log("Server: Dispatch message for all connections: " + connections.length);
                    		    for (var i = 0;i < connections.length; i++) {
                        		if(connections[i].socket !== connection) {
                            		    console.log("Server: Send message <" + msg.data.type + "> to <" + connections[i].id + ">");
                            		    connections[i].socket.send(message.utf8Data);
                        		}
                    		    }
                    		    console.log("Server: Dispatch end");
				}
			}
		}
		else {
		  console.log("RECEIVED OTHER:" + evt.binaryData);
		}
	});

	connection.on('close', function(evt) {
		console.log("Server: One peer lost...");
		var index = -1;

        	for (var i = 0;i < connections.length; i++) {
            	    if(connections[i].socket === connection) {
                        index = i;
                    }
        	}

        	if(index > -1) {
            	    var old = connections.splice(index, 1);
            	    console.log("Server: remove item " + old[0].id);
            	    console.log("Server: " + connections.length + " connections still remains");
                    //Inform others peer about the disconnection
                    for (var i = 0;i < connections.length; i++) {
                	if(connections[i].socket !== connection) {

                    	    var toSend = {
                            	data: {
                                     type:'release'
                                },
                                callee: 'all',
                                caller:old[0].id
                            };
                            connections[i].socket.send(JSON.stringify(toSend));
                    	}
                    }

                    old = null;
        	}
		
	});
});


