import Server from './index.js';

let server = new Server('test', Server.Auth.NO_AUTH);

server
	.api('api')
		.get('item/{id:number}', async (reply, {id})=>{
			return await reply.json({id: id});
		})

server.start(80);