const path = require('path');
const url = require('url');
const dgram = require('dgram');
const net = require('net');

const Max = require('max-api');


var server = false;
var connectedClients = {};
	
var client = false;

const DataModes = [
	'utf8',
	'hex',
	'base64'
];
var dataMode = 'utf8';

var trimEnabled = true;


// This will be printed directly to the Max console
Max.post(`Loaded the ${path.basename(__filename)} script`);
	
	
Max.addHandler('datamode', (mode) => {

	if (typeof mode !== 'undefined'){
		
		if (DataModes.indexOf(mode) == -1 ){
			return console.error(`Invalid datamode ${mode}`);
		}
		
		dataMode = mode;
	}
			
	Max.outlet('datamode', dataMode);
});

Max.addHandler('trim', (enabled) => {

	if (typeof enabled !== 'undefined'){
	
		trimEnabled = 0 < parseInt(enabled);	
	}
			
	Max.outlet('trim', trimEnabled ? 1 : 0);
});
	

function udpSend(client, host, port, data) {
	
	data = Buffer.from(data, dataMode);
	
	client.send(data, port, host, (err) => {
  		client.close();
		if (err) {
			Max.outlet('udp-send', 'error', err.message);
		}
		Max.outlet('udp-send', 'ok');
	});
}

Max.addHandler("udp-send", (host,port,...data) => {
	
	if (!host)
		 return Max.outlet('udp-send', 'error', 'missing host');	
	if (!port)
		return Max.outlet('udp-send',  'error', 'missing port');
		
	if (data.length == 0){
		return Max.outlet('udp-send', 'error', 'missing message');
	}
	
	var data = data.join(' ');
	
	const client = dgram.createSocket('udp4');
	
	udpSend( client, host, port, data );
});

Max.addHandler("udp-send-bc", (host,port,...data) => {
	
	if (!host)
		 return Max.outlet('udp-send', 'error', 'missing host');	
	if (!port)
		return Max.outlet('udp-send', 'error', 'missing port');
		
	if (data.length == 0){
		return Max.outlet('udp-send', 'error', 'missing message');
	}
	
	var data = data.join(' ');
	
	const client = dgram.createSocket('udp4');
	
	client.bind( () => {
		client.setBroadcast(true);
		udpSend(  client, host, port, data );
	});	
});

function startUdpServer(port,address) {

	server = dgram.createSocket('udp4');

	server.on('error', (err) => {
  		Max.outlet('udp-recv', 'error',  err.message);
		console.error(err);
  		server.close();
	});

	server.on('listening', () => {
  		const address = server.address();
  		console.log(`server listening ${address.address}:${address.port}`);
		Max.outlet('udp-recv', 'start');
	});

	server.on('close', () => {
  		console.log(`server closed`);
		server = false;
		Max.outlet('udp-recv', 'stop');
	});
	
	server.on('message', (data, rinfo) => {
		
		var dlen = data.length;
		
		data = data.toString(dataMode);
		
		if (dataMode == 'utf8' && trimEnabled){
			data = data.trim();
			dlen = data.length;
		}
		
		Max.outlet('udp-recv', 'data', rinfo.address, rinfo.port, dlen, data);
	});
		
	server.bind(port,address);
}
	

Max.addHandler("udp-recv", (cmd, port, address) => {

	if (cmd == 'start'){
		if (server) {
			server.close( () => {
				startUdpServer(port,address);	
			});
		} else {
			startUdpServer(port,address);
		}
	}
	else if (cmd == 'stop') {
		if (server){
			server.close(()=>{
				Max.outlet('udp-recv', 'stop');
			});
		} else {
			console.log('Server not running');
			Max.outlet('udp-recv', 'stop');
		}
	}
	
});

function startTcpServer(port,host)
{
	server = net.createServer();
	
	server.on('error', (err) => {
  		Max.outlet('tcp-listen', 'error', err.message);
		console.error(err);
  		server.close();
	});


	server.on('listening', () => {
  		const address = server.address();
  		console.log(`server listening ${address.address}:${address.port}`);
		Max.outlet('tcp-listen', 'start');
	});

	server.on('close', () => {
		server = false;
		connectedClients = {};
		Max.outlet('tcp-listen', 'stop');
	});

	server.on('connection', (socket) => {
  		//const serverAddress = server.address();
		const remote = {
			addr: socket.remoteAddress,
			port: socket.remotePort,
			family: socket.remoteFamily
		};
		

		connectedClients[`${remote.addr}:${remote.port}`] = socket;

		Max.outlet('tcp-listen', 'connect', remote.addr, remote.port);
		
		socket.on('error', (err) => {
			console.error(err);
			socket.end();
  			Max.outlet('tcp-listen', 'error', err.message);
		});
		
		socket.on('end', () => {
			delete connectedClients[`${remote.addr}:${remote.port}`];
			Max.outlet('tcp-listen', 'disconnect', remote.addr, remote.port);
		});
				
		socket.on('data', (data) => {
			
			var dlen = data.length;
			
			data = data.toString(dataMode);
		
			if (dataMode == 'utf8' && trimEnabled){
				data = data.trim();
				dlen = data.length;
			}
			
			Max.outlet('tcp-listen', 'data', remote.addr, remote.port, dlen, data);
		});
		
		socket.on('drain', () => {
			Max.outlet('tcp-listen', 'sent', remote.addr, remote.port);
		});
		
	});
			
	server.listen( port, host );
}

Max.addHandler('tcp-listen', (cmd, ...opt) => {
	
	if (cmd == 'start'){
		const port = opt[0];
		const host = opt[1];
		if (server) {
			server.close( () => {
				startTcpServer(port,host);	
			});
		} else {
			startTcpServer(port,host);
		}
	}
	else if (cmd == 'stop') {
		if (server){
			server.close(()=>{
				Max.outlet('tcp-listen', 'stop');
			});
		} else {
			console.log('Server not running');
			Max.outlet('tcp-listen', 'stop');
		}
	}
	else if (server && server instanceof net.Server){
		if (cmd == 'disconnect') {
			const target = opt[0];
			
			if (!connectedClients[target]){
				return Max.outlet('tcp-listen', 'error', target, 'not connected, can not disconnect');
			}
			
			connectedClients[target].end();
		}
		else if (cmd == 'sendto') {
			const recipient = opt[0];
			const data = opt.slice(1).join(' ');
		
			if (recipient == 'all') {
				for(var i in connectedClients){
					connectedClients[i].write(data);
				}
			} else {
		
				if (!connectedClients[recipient]){
					return Max.outlet('tcp-listen', 'error', recipient, 'not connected, can not send');
				}
				
				connectedClients[recipient].write(data);	
			}
		}
	}
	
});



function startTcpClient(host, port)
{
	client = new net.Socket();
	
	client.on('error', (err) => {
		console.error(err);
		client.end(() => {
  			client.close();
		});
  		Max.outlet('tcp', 'error', err.message);
	});

	client.on('end', () => {
		client.destroy();
		client = false;
		Max.outlet('tcp', 'disconnect', host, port);
	});
	
	client.on('connect', () => {
		Max.outlet('tcp',  'connect', host, port);	
	});
					
	client.on('data', (data) => {
		
		var dlen = data.length;
		
		data = data.toString(dataMode);
		
		if (dataMode == 'utf8' && trimEnabled){
			data = data.trim();
			dlen = data.length;
		}
		
		Max.outlet('tcp', 'data', dlen, data);
	});
		
	client.on('drain', () => {
		Max.outlet('tcp', 'sent');
	});
	
	
	client.connect(port, host);
}

Max.addHandler('tcp', (cmd, ...opt) => {
	
	if (cmd == 'connect'){
		const host = opt[0];
		const port = opt[1];
		if (client) {
			client.end( () => {
				startTcpClient(host, port);	
			});
		} else {
			startTcpClient(host, port);
		}
	}
	else if (cmd == 'disconnect') {
		if (client){
			client.end();
		} else {
			console.log('client not connected');
			Max.outlet('tcp', 'disconnect');
		}
	}
	else if (client && client instanceof net.Socket){
		if (cmd == 'send') {
			const data = opt.join(' ');
		
			client.write( data );
		}	
	}
	
});



