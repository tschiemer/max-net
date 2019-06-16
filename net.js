const path = require('path');
const url = require('url');
const dgram = require('dgram');
const net = require('net');

const Max = require('max-api');


var server = false;
var connectedClients = {};
	
var client = false;


// This will be printed directly to the Max console
Max.post(`Loaded the ${path.basename(__filename)} script`);
	

function udpSend(client, host, port, data) {
	client.send(data, port, host, (err) => {
  		client.close();
		if (err) {
			Max.outlet(`udp-send error ${err.message}`);
		}
		Max.outlet('udp-send ok');
	});
}

Max.addHandler("udp-send", (host,port,...data) => {
	
	if (!host)
		 return Max.outlet('udp-send error missing host');	
	if (!port)
		return Max.outlet('udp-send error missing port');
		
	if (data.length == 0){
		return Max.outlet('udp-send error missing message');
	}
	
	var data = data.join(' ');
	
	const dataBuf = Buffer.from(data);
	const client = dgram.createSocket('udp4');
	
	udpSend( client, host, port, dataBuf );
});

Max.addHandler("udp-send-bc", (host,port,...data) => {
	
	if (!host)
		 return Max.outlet('udp-send error missing host');	
	if (!port)
		return Max.outlet('udp-send error missing port');
		
	if (data.length == 0){
		return Max.outlet('udp-send error missing message');
	}
	
	var data = data.join(' ');
	
	const dataBuf = Buffer.from(data);
	const client = dgram.createSocket('udp4');
	
	client.bind( () => {
		client.setBroadcast(true);
		udpSend(  client, host, port, dataBuf );
	});	
});

function startUdpServer(port,address) {

	server = dgram.createSocket('udp4');

	server.on('error', (err) => {
  		Max.outlet(`udp-recv error ${err.message}`);
		console.error(err);
  		server.close();
	});

	server.on('listening', () => {
  		const address = server.address();
  		console.log(`server listening ${address.address}:${address.port}`);
		Max.outlet('udp-recv start');
	});

	server.on('close', () => {
  		console.log(`server closed`);
		server = false;
		Max.outlet('udp-recv stop');
	});
	
	server.on('message', (msg, rinfo) => {
		Max.outlet(`udp-recv data ${rinfo.address} ${rinfo.port} ${msg}`);
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
				Max.outlet('udp-recv stop');
			});
		} else {
			console.log('Server not running');
			Max.outlet('udp-recv stop Was not running anyways..');
		}
	}
	
});

function startTcpServer(port,host)
{
	server = new net.Server();
	
	server.on('error', (err) => {
  		Max.outlet(`tcp-listen error ${err.message}`);
		console.error(err);
  		server.close();
	});


	server.on('listening', () => {
  		const address = server.address();
  		console.log(`server listening ${address.address}:${address.port}`);
		Max.outlet('tcp-listen start');
	});

	server.on('close', () => {
		server = false;
		connectedClients = {};
		Max.outlet('tcp-listen stop');
	});

	server.on('connection', (socket) => {
  		const serverAddress = server.address();
		const clientAddress = socket.address();

		connectedClients[clientAddress.address] = socket;

		Max.outlet(`tcp-listen connect ${clientAddress.address} ${clientAddress.port}`);
		
		socket.on('error', (err) => {
			console.error(err);
			socket.end();
  			Max.outlet(`tcp-listen error ${err.message}`);
		});
		
		socket.on('end', () => {
			delete connectedClients[clientAddress.address];
			Max.outlet(`tcp-listen disconnect ${clientAddress.address} ${clientAddress.port}`);
		});
				
		socket.on('data', (data) => {
			Max.outlet(`tcp-listen data ${clientAddress.address} ${clientAddress.port} ${data}`);
		});
		
		socket.on('drain', () => {
			Max.outlet(`tcp-listen sent ${clientAddress.address} ${clientAddress.port}`);
		});
		
	});
			
//	server.on('message', (msg, rinfo) => {
//		Max.outlet(`tcp-listen MSG ${rinfo.address} ${rinfo.port} ${msg}`);
//	});

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
				Max.outlet('tcp-listen stop');
			});
		} else {
			console.log('Server not running');
			Max.outlet('tcp-listen stop Was not running anyways..');
		}
	}
	else if (server && server instanceof net.Server){
		if (cmd == 'disconnect') {
			const target = opt[0];
			
			if (!connectedClients[target]){
				return Max.outlet(`tcp-listen error ${target} not connected, can not disconnect `);
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
					return Max.outlet(`tcp-listen error ${recipient} not connected, can not send `);
				}
				
				connectedClients[recipient].write(data);
				
			}
		
			
//, 'utf-8', () => {
//			Max.outlet(`tcp-listen send ${recipient} ok`);
//		});
		}
		//else if (cmd == 'sendtoall') {
		//
		//	const data = opt.slice(1).join(' ');
		//
		//	for(var i in connectedClients){
		//		connectedClients[i].write(data);
		//	}
		//}
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
  		Max.outlet(`tcp error ${err.message}`);
	});

	client.on('end', () => {
		client.destroy();
		client = false;
		Max.outlet(`tcp disconnect ${host} ${port}`);
	});
	
	client.on('connect', () => {
		Max.outlet(`tcp connect ${host} ${port}`);	
	});
					
	client.on('data', (data) => {
		Max.outlet(`tcp data ${data}`);
	});
		
	client.on('drain', () => {
		Max.outlet(`tcp sent`);
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
			Max.outlet('tcp disconnect Was not connected anyways..');
		}
	}
	else if (client && client instanceof net.Socket){
		if (cmd == 'send') {
			const data = opt.join(' ');
		
			client.write( data );
		}	
	}
	
});



