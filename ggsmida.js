var events = []; //store all the events
var _callbacks = eventsmida();
_callbacks.on("checkToSend", checkToSend, this);

var ID = new Date().getTime().toString(); //ID of user
var PSEU = "X-Man"; //nick name of user

var streamVideo = null; //video stream acquired by videosmida
var socket = null; //objet websocket
var host = null; //address of websocket server
var port = null; //port of websocket server
var stunConfig = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
var tmpOffer = null; //store information of offer temporarily
var _peers = {}; //used to store all RTCPeerConnections
//var peer; // current RTCPeerConnection;
var remoteStreamConnected = false; //indicate whether remote stream is connected(not used yet)
//var id_callee = null; // id of callee
var isFirefox = false;
var isChrome = false;
var isDataChannelReady = false;
var isReadyChannels = {}; // store isDataChannelReady for all channels;
//var _channel = null; //DataChannel;
var _channels = {}; //store all data channels {peerid:channel}
var _file = []; //store blobs of a file.
var file; //file to be sent
var fileInfo = null; // file information
var remainingBlob; //remaining of file

/**
 * peerConnection, used to return a RTCPeerConnection
 * @param {object} config, used to configure RTCpeerConnection. we use stunConfig here when using this function
 */
function peersmida(config, callee, type) {
	
 var peerConnection = adaptersmida().RTCPeerConnection(config);

/**
 * peerConnection.onaddstream, trigged when remote media is attached
 *
 */
 peerConnection.onaddstream = function(event) {
	console.log("ggsmida-onaddstream :: Remote stream added.");
	remoteStreamConnected = true;
	_callbacks.trigger("onRemoteMediaStarted",event.stream);
	
 };
 
 /**
  * peerConnection.onnegotiationneeded, trigged when peer.addstream() is called
  *
  */
  peerConnection.onnegotiationneeded = function(event) {
        console.log("ggsmida-onaddstream :: On negotiation needed for PEER CONNECTION <" + ID + ">", event);
  };
 
/**
  * peerConnection.onsignalingstatechange, trigged when signalingState is changed
  *
  */
peerConnection.onsignalingstatechange = function(event) {
        var signalingState = "";
        if(event.target) {
            signalingState = event.target.signalingState;
        }
        else if(event.currentTarget) {
            signalingState = event.currentTarget.signalingState;
        }
        else {
            signalingState = event;
        }
        console.log("ggsmida-onsignalingstatechange :: On signaling state changes to " + signalingState + " for PEER CONNECTION <" + ID + ">", event);
};
 
/**
 * peerConnection.onicecandidate, trigged when there is icecandidate to add
 *
 */
peerConnection.onicecandidate = function(event) {
        if (event.candidate) {
            console.log("ggsmida-onicecandidate :: Get local ICE CANDIDATE from PEER CONNECTION <" + ID + ">", event);
            console.log("ggsmida-onicecandidate :: Send ICE Candidate received by Peer Connection <" + ID + ">");
			var message = {
                        data: {
                            type: 'candidate',
                            label: event.candidate.sdpMLineIndex,
                            id: event.candidate.sdpMid,
                            candidate: event.candidate.candidate
                        },
                        caller: type+ID,
			callee: callee
            };
			socket.send(JSON.stringify(message));
			
        } 
	else {
            console.log("ggsmida-onicecandidate :: No more local candidate to PEER CONNECTION <" + ID + ">", event);
            console.log("ggsmida-onicecandidate :: All Candidates have been added to PeerConnection <" + ID + ">"); 
        }
};

/**
 * peerConnection.ondatachannel, triggered when datachannel of peer is demanded
 *
 */
 peerConnection.ondatachannel = function(event) {
	console.log("ggsmida-ondatachannel :: Received Data Channel!");
	datachannelsmida(callee, peerConnection, event.channel);
 };

return peerConnection;

};
	
/**
 * datachannelsmida, create DataChannel and analyze message received by datachannel
 * @param {String} id of callee
 * @param {object} peer used to create Data Channel
 * @param {object} received channel
 */
function datachannelsmida(callee, peerCreated, channel, isSend) {

	var _channel;

	if(!channel) {
		_channel = peerCreated.createDataChannel(callee, null); //param: (id of channel, dataChannelOptions), dataChannelOptions can be set reliable or unreliable mode(TCP/UDP) and so on. it's SCTP 
		console.log("ggsmida-datachannelsmida :: Create a new datachannel!");
		
	}
	else {
		_channel = channel;
		console.log("ggsmida-datachannelsmida :: Use existing channel received from <"+ callee +">!");
	}

	if(!(callee in _channels)) {
		console.log("ggsmida-datachannelsmida :: push channel <"+callee+"> into _channels!");
		_channels[callee] = _channel;
	}

	_channel.onopen = function() {
		console.log("ggsmida-datachannelsmida :: DataChannel is successfully opened for peer <"+callee+"> !");
		isDataChannelReady = true;
		isReadyChannels[callee] = isDataChannelReady;
		if(isSend){
			_callbacks.trigger("checkToSend", callee);
		}
	}

	_channel.onerror = function(e) {
		console.log("ggsmida-datachannelsmida :: DataChannel error for peer <"+callee+"> !");
		isDataChannelReady = false;
		isReadyChannels[callee] = isDataChannelReady;
	}

	_channel.onclose = function(e) {
		console.log("ggsmida-datachannelsmida :: DataChannel closed for peer <"+callee+"> !");
		isDataChannelReady = false;
		isReadyChannels[callee] = isDataChannelReady;
	}

	_channel.onmessage = function(e) {
		console.log("ggsmida-datachannelsmida :: DataChannel Received message!");

		var ack = {
			type: "FILE_ACK"
		};

		if(e.data instanceof ArrayBuffer) {
			var blob = new Blob([e.data], {type: fileInfo.type});
			_file.push(blob);
			_channel.send(JSON.stringify(ack));
		}
		else if (e.data instanceof Blob) { //In fact, Blob type is not yet implemented in ggsmida
			_file.push(e.data);
			_channel.send(JSON.stringify(ack));
		}
		else {

		    try {
			if(e.data.indexOf('{') === 0) {
			    var jsonMessage = JSON.parse(e.data);

			    switch (jsonMessage.type) {
                            case "FILE_START":
                                console.log("ggsmida-datachannelsmida :: Start receiving file", jsonMessage.content);
                                _file = [];
                                fileInfo = jsonMessage.content;
                                break;
                            case "FILE_END":
                                var fullFile = new Blob(_file);
                                console.log("ggsmida-datachannelsmida :: End receiving file");
                                var filemsg = {
                                    info: fileInfo,
                                    content: fullFile
                                };
                                _callbacks.trigger('onFileReceived', filemsg);
                                break;
                            case "FILE_ACK":                         
                                if(remainingBlob.size) {
                                    sendblobsmida(remainingBlob,callee);
                                }
                                else {
                                    console.log("ggsmida-datachannelsmida :: No more part to send");
                                     var msg = {
                                        type: "FILE_END"
                                    };
                                    _channel.send(JSON.stringify(msg));
                                }
                                break;
			    }                            
			}
		    }
		    catch(err) {
			console.error(err);
		    }
		}
	}
}


/**
 * acquire local media
 * @param {object} constraints, the constraints to acquire local media
 */
function videosmida (constraints) {

	adaptersmida().getUserMedia(
		//constraints
		constraints,

		//successCallback		
		function(stream) {
			streamVideo = stream;
			console.log("ggsmida-videosmida :: getUserMedia success!");
			_callbacks.trigger("onLocalMediaStarted", stream);
		},

		//errorCallback
		function(err) {
			console.log("ggsmida-videosmida :: error occured when getUserMedia!");
		},

		this
	);

}

/**
 * video call
 * @param {String} id of callee
 */
function videocallsmida (callee) {

	_peers["v"+callee] = peersmida(stunConfig, callee, "v");
	var peer = _peers["v"+callee];

	if(streamVideo) {
		var streams = peer.getLocalStreams(),
		alreadyAdded = false;
		for(var i=0; i<streams.length; i++) {
			if(streams[i].id === streamVideo.id) {
				alreadyAdded = true;
			}
		}
		if(!alreadyAdded) {
			console.log("ggsmida-videocallsmida :: attach a stream to the peer");
			peer.addStream(streamVideo);
		}
		else {
			console.log("ggsmida-videocallsmida :: stream already added to the peer.");
		}

		peer.createOffer(function(offerSDP) {
			peer.setLocalDescription(offerSDP, function() {
				// send the offer to a server to be forwarded to the friend you're calling.
				console.log("ggsmida-videocallsmida :: set local SDP success.");
				var event = {
			 	    data: offerSDP,
			   	    caller: "v"+ID,
				    callee: callee
				};   
				socket.send(JSON.stringify(event));
				console.log("ggsmida-videocallsmida :: send offerSDP", event);
			}, function(error){
				console.log("ggsmida-videocallsmida :: setLocalDescription error!");
			});
		}, function(error){
			console.log("ggsmida-videocallsmida :: createOffer error!");
		});
	}
	else {
		console.log("ggsmida-videocallsmida :: no stream to add to the peer.");
	}

	
}

/**
 * call to establish data channel with remote peer
 * @param {String} id of callee
 */
function datacallsmida (callee, flag) {

	_peers["d"+callee] = peersmida(stunConfig, callee, "d");
	var peer = _peers["d"+callee];

	datachannelsmida(callee, peer, null, flag);

	peer.createOffer(function(offerSDP) {
		peer.setLocalDescription(offerSDP, function() {
				// send the offer to a server to be forwarded to the friend you're calling.
				console.log("ggsmida-videocallsmida :: set local SDP success.");
				var event = {
			 	    data: offerSDP,
			   	    caller: "d"+ID,
				    callee: callee
				};   
				socket.send(JSON.stringify(event));
				console.log("ggsmida-videocallsmida :: send offerSDP", event);
		}, function(error){
			console.log("ggsmida-videocallsmida :: setLocalDescription error!");
		});
	}, function(error){
		console.log("ggsmida-videocallsmida :: createOffer error!");
	});
}

/**
 * send file.
 * @param {Object} file to be sent.
 * @param {String} id of callee
 */
function sendfilesmida (pfile, callee) {

	file = pfile;

	if(!(callee in _channels)) {

		datacallsmida(callee, true);
	}
	else {
		checkToSend(callee);
	}
		
}

/**
 * check stats of channel and send file. only used in the function sendfilesmida(pfile,callee).
 * used to solve the problem: wait until the datachannel is established and then send file
 */
function checkToSend(id_callee) {

  console.log("ggsmida-checkToSend :: "+isReadyChannels[id_callee]);
  if(isReadyChannels[id_callee]){
    
	var reader = new FileReader();

	var msg = {
		type: "FILE_START",
		content: {
			fileName: file.name,
			size: file.size,
			type: file.type
		}
	};

	console.log("ggsimda-checkToSend :: Send a file to peer <"+id_callee+">!");
	_channels[id_callee].send(JSON.stringify(msg));

	reader.onload = function(file) {
		if(reader.readyState === FileReader.DONE) {
			sendblobsmida(new Blob([file.target.result]), id_callee);
		}
	};

	reader.readAsArrayBuffer(file);
  }

}

/**
 * send file blob. It deals with blob: if blob is too large, slice it into chunks and send them one by one
 * @param {object} blob File or a part of a file
 */
function sendblobsmida (blob, callee) {

	var toSend = null,
            chunkLength = 64000,  //62KB
            fr = new FileReader();

        if (blob.size > chunkLength) {
            toSend = blob.slice(0, chunkLength);
        }
        else {
            toSend = blob;
        }

        fr.onload = function() {
            remainingBlob = blob.slice(toSend.size);
            _channels[callee].send(this.result); //when the blob has been read into memory fully, set the result attribute as ArrayBuffer
        };
        
        fr.readAsArrayBuffer(toSend);
}


/**
 * stop video
 * @param {String} id of callee
 */
function stopvideosmida (callee) {
	
	if(streamVideo) {
		streamVideo.stop();
	}

	var event = {
	    	data: {
		    type: 'bye'
		},
		calller: ID,
		callee: callee
	};
	socket.send(JSON.stringify(event));
	console.log("ggsmida-stopvideosmida :: stop video call", event);
}

/**
 * send immediate message
 * @param {String} id of callee
 * @param {String} message
 */
function sendmessagesmida (callee, msg) {

	var message = {
		data: {
		    type: 'msg',
		    content: msg
		},
		caller: ID,
		callee: callee
	};
	socket.send(JSON.stringify(message));
	console.log("ggsmida-sendmessagesmida :: send a message to " + callee, message);
}

/**
 * manage events, including save, delete and trigger events. Mainly for calling functions in the frontend
 * 
 */
function eventsmida () {
		
	return {
	    on : function (name, callback, context) {
	        events.push({name: name, callback: callback, ctx: context || this});
	    },
	
	    off : function (name) {
	        var continueToDelete = true;
	        while (continueToDelete) {
	    	    for (var i=0, l=events.length; i<l; i++) {
		        if(events[i].name === name) {
		             events.splice(i,1);
		             continueToDelete = true;
		             break;
		        }
		        else {
		            continueToDelete = false;
		        }
	            }
	        }
	    },

	    trigger : function (name, args) {
	    	if (events) {
                   for (var i=0;i<events.length;i++) {
		        if(events[i].name === name) {
                       	    events[i].callback.call(events[i].ctx, args);
			}
                   }
                }
	    }
	}
}

/**
 * websocket manager
 * 
 */
function websocketsmida (config) {

	host = config.host;
	port = config.port;
	websocketeventsmida(); //subscribe websocket events to object events with eventsmida

	return {
	    connect : function (userName) {
		PSEU = userName;
		if(!socket) {
		    socket = new WebSocket("ws://" + host + ":" + port);
		    
		    socket.onopen = function() {
				console.log("ggsmida-websocketsmida :: Channel Ready");
				var msg = {
					data: {
						type: 'join'
					},
					caller: ID,
					callee: 'all',
					callerpseu: PSEU
				};
				console.log("ggsmida-websocketsmida :: send a message " + JSON.stringify(msg));
				socket.send(JSON.stringify(msg));			    
		    };

		    socket.onmessage = function(msg) {
				var message = JSON.parse(msg.data);
				if(message.data.type !== undefined) {
					console.log("ggsmida-websocketsmida :: Received a message of type " + message.data.type);
					_callbacks.trigger('onMessage', message); 
				}
				else {
					console.log("ggsmida-websocketsmida :: Unknown message type !!! " + message);
				}
		    };
		    
		    socket.onclose = function() {
				console.log("ggsmida-websocketsmida :: socket closed !");
		    };

		    socket.onerror = function(err) {
				console.log("ggsmida-websocketsmida :: Socket error occured!",err);
		    };
		}
	    }
	}
}

/**
 *Used to subscribe websocket events to object events with eventsmida. It's used to analyze different types of websocket messsage and then call the corresponding functions in the frontend.
 *
 */
function websocketeventsmida () {

	_callbacks.on('onMessage', function(msg) {
		
		switch (msg.data.type) {
		    case 'join':
			_callbacks.trigger('onPeerConnected', {id: msg.caller, pseu: msg.callerpseu});
			break;
		    case 'already_joined':
			_callbacks.trigger('onPeerConnected', {id: msg.caller, pseu: msg.callerpseu});
			break;
		    case 'release':
			_callbacks.trigger('onPeerDisconnected', {id: msg.caller});
			break;
		    case 'offer':
			tmpOffer = msg;
			_callbacks.trigger('onCallOffered', {id: msg.caller});
			break;
		    case 'answer':
			_callbacks.trigger('onCallAnswered', {id: msg.caller});
			_peers[msg.caller].setRemoteDescription(adaptersmida().RTCSessionDescription(msg.data));
			break;
		    case 'candidate':
			console.log("ggsmida-websocketeventsmida :: Add ICE Candidate to the peer.");
			var candidate = adaptersmida().RTCIceCandidate({sdpMLineIndex:msg.data.label, candidate:msg.data.candidate, id:msg.data.id});
			_peers[msg.caller].addIceCandidate(candidate);
			break;
		    case 'msg':
			console.log("ggsmida-websocketeventsmida :: Received a message.");
			_callbacks.trigger('onMessageReceived', {id: msg.caller, content: msg.data.content});
			break;
		    case 'bye':
			_callbacks.trigger('onCallEnded', {id: msg.caller, pseu: msg.callerpseu});
			break;
		    default:
		
			break;
		}
	}, this);
}

/**
 * answer to offer from a peer
 *
 */
function answersmida (callee) {

	_peers[callee] = peersmida(stunConfig, callee.substring(1), callee.substring(0,1));
	var peer = _peers[callee];

	peer.setRemoteDescription(adaptersmida().RTCSessionDescription(tmpOffer.data));
	console.log("ggsmida-answersmida :: set remote SDP success");
	peer.createAnswer(function(answerSDP) {
		peer.setLocalDescription(answerSDP, function() {
			// send the offer to a server to be forwarded to the friend you're calling.
			var event = {
			    data: answerSDP,
			    caller: callee.substring(0,1)+ID,
			    callee: callee.substring(1)
			};   
			socket.send(JSON.stringify(event));
			console.log("ggsmida-answersmida :: send answer", event);
		}, function(error){
			console.log("ggsmida-answersmida :: setLocalDescription error!");
		});
	},function(error){
			console.log("ggsmida-answersmida :: createAnswer error!");
	});
}


/**
 * adaptersmida between Chrome and Firefox
 * Only a part of functions are defined, we can add more functions depending on utilisation
 */
function adaptersmida () {

	if(navigator.mozGetUserMedia && window.mozRTCPeerConnection) {
		isFirefox = true;
	}
	else if(navigator.webkitGetUserMedia && window.webkitRTCPeerConnection) {
		isChrome = true;
	}
	return {
		RTCPeerConnection : function (stun) {
			if(isChrome) {
				return new window.webkitRTCPeerConnection(stun);

			} 
			else if (isFirefox) {
				return new window.mozRTCPeerConnection(stun);
			}
		},

		getUserMedia : function (constraints, callback, errCallback, context) {
			if(isChrome) {
				return navigator.webkitGetUserMedia.bind(navigator).call(context, constraints, callback, errCallback);
			}
			else if(isFirefox) {
				return navigator.mozGetUserMedia.bind(navigator).call(context, constraints, callback, errCallback);
			}
		},

		RTCSessionDescription : function (sdp) {
			if(isChrome) {
				return new window.RTCSessionDescription(sdp);
			}
			else if(isFirefox) {
				return new window.mozRTCSessionDescription(sdp);
			}
		},

		RTCIceCandidate: function (candidate) {
			if(isChrome) {
				return new window.RTCIceCandidate(candidate);
			} 
			else if(isFirefox) {
				return new window.mozRTCIceCandidate(candidate);
			}	
		}
	}
}


 






























