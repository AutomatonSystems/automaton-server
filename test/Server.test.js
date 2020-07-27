import assert from 'assert';

import Server from '../src/Server.js';
import fetch from 'node-fetch';

const SERVER_NAME = 'test-server';
const SERVER = new Server(SERVER_NAME);

const TEST_PORT = 8003;

async function getStatus(){
	let resp = await fetch(`http://localhost:${TEST_PORT}/status`);
	return await resp.json();
}

/*async function ping(){
	let resp = await fetch(`localhost:${TEST_PORT}/ping`);
	let json = await resp.json();
	if(json.status == 'pong'){
		return true;
	}
	return false;
}*/

describe('Server', ()=>{

	SERVER.verbose = false;

	describe('start(port)', ()=>{

		afterEach(async ()=>{
			SERVER.stop();
		});

		it('starts on the requested port', async ()=>{
			SERVER.start(TEST_PORT);
			let status = await getStatus();
			assert.equal(status.service, SERVER_NAME);
		})

	});

		// setup very basic ping
	//SERVER.api('ping').get('', reply=>reply.json({status:'pong'}));
});