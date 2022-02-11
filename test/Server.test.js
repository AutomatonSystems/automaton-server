import assert from 'assert';

import Server, { StatusMode } from '../dist/AutomatonServer.js';
import fetch from 'node-fetch';

const SERVER_NAME = 'automaton-server';
const SERVER = new Server();

const SERVER_PORT = 8003;

async function getJson(path){
	let resp = await fetch(`http://localhost:${SERVER_PORT}/${path}`);
	return await resp.json();
}

describe('Server', ()=>{

	SERVER.verbose = false;
	SERVER.config.statusMode = StatusMode.EXTENDED;
	SERVER.start(SERVER_PORT);

	describe('start(port)', ()=>{

		it('starts on the requested port', async ()=>{
			let status = await getJson('status');
			assert.equal(status.service, SERVER_NAME);
		})

	});

	// setup very basic api
	const PING_RESPONSE = {status:'pong'};
	SERVER.api('ping').get('/', reply=>reply.json(PING_RESPONSE));

	// setup an api that just sends back whatever you pass it
	SERVER.api('echo').get('{value}', (reply,{value})=>reply.json(value));

	// setup an api with multiple endpoints
	SERVER.api('api').get('basic', (reply)=>reply.json(PING_RESPONSE));	
	SERVER.api('api').get('multiple-values/{a}/{b:number}/{c:json}/{d:boolean}', (reply,{a,b,c,d})=>reply.json({a,b,c,d}));
	SERVER.api('api').get('multiple-values/{a}/{b:number}', (reply,{a,b})=>reply.json(a + b));

	describe('api(path)', ()=>{
		it('Can serve a basic response on api root', async ()=>{
			let status = await getJson('ping');
			assert.deepEqual(status, PING_RESPONSE);
		});

		it('API root is not case sensitive', async ()=>{
			let status = await getJson('PiNg');
			assert.deepEqual(status, PING_RESPONSE);
		});

		it('Can parse and return a single path values', async ()=>{
			let echo = await getJson('echo/hello');
			assert.deepEqual(echo, 'hello');
		});

		it('API handler is not case sensitive', async ()=>{
			let status = await getJson('api/BaSiC');
			assert.deepEqual(status, PING_RESPONSE);
		});

		it('Can parse and return multiple path values', async ()=>{
			let multiple = await getJson('api/multiple-values/stringThing/100/{"key":"value"}/true');
			// NB stringThing is mixed case! It should match exactly and not be lowercase!
			assert.deepEqual(multiple, {"a": "stringThing", "b": 100, "c": {"key":"value"}, "d": true});
		});

		it('Matches the correct path where overlap exists', async ()=>{
			let multiple = await getJson('api/multiple-values/stringThing/100');
			// NB stringThing is mixed case! It should match exactly and not be lowercase!
			assert.deepEqual(multiple, "stringThing100");
		});
	});

	after(()=>{
		SERVER.stop();
	})
});