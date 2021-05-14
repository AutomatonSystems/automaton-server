import Server from './dist/AutomatonServer.js';

let server = new Server('test', Server.Auth.NO_AUTH);

Server.EXTENDED_STATUS_MODE = true;

server
	.api('api')
		.get('item/{id:number}', async (reply, {id})=>{
			return await reply.json({id: id});
		})

server.start(80);