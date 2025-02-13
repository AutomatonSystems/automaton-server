import Server, { Body, StatusMode } from '../src/AutomatonServer.js';
import fs from 'fs';
let server = new Server();
server.config.statusMode = StatusMode.EXTENDED;
server.serve('/', './example/');
server
	.api('api')
		.post('file', Body.BLOB, async (reply, {body})=>{
			console.log(body);
			return await reply.json({});
		})
		.post('array', Body.STREAM, async (reply, {body})=>{
			console.log("writing");

			// write the file to disk
			await new Promise(res=>{
				let stream = fs.createWriteStream('./output.zip')
				body.pipe(stream);
				body.on('end',res);
			})

			console.log("written");
			//fs.writeFile('./output.zip', body, null, ()=>{console.log("done")});
			return await reply.json({});
		})
		.get('item/{id:number}', async (reply, {id})=>{
			return await reply.json({id: id});
		});

server.start(80);
