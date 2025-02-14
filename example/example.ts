import { Stream } from 'stream';
import Server, { Body, metabody, metaname, metaresp, StatusMode } from '../src/AutomatonServer.js';
import fs from 'fs';

type FishObj = {
	fish: number
}

type Norp = {type: string};

let server = new Server();
server.config.statusMode = StatusMode.EXTENDED;
server.serve('/', './example/');
server
	.api('api')
		.post('file', Body.BLOB, async (reply, {body})=>{
			console.log(body);
			return await reply.json({});
		})
		.post<Norp, {}>('magic-json', Body.JSON,
			metaresp("{}",
			metabody("Norp",
				async (reply, {body})=>{
					console.log(body);
					return await reply.json({});
				}
			))
		)
		.post<Stream, FishObj>('array', Body.STREAM,
			metaresp("FishObj",
			metaname("makeArray",
				async (reply, {body})=>{
					console.log("writing");

					// write the file to disk
					await new Promise(res=>{
						let stream = fs.createWriteStream('./output.zip')
						body.pipe(stream);
						body.on('end',res);
					})

					console.log("written");
					//fs.writeFile('./output.zip', body, null, ()=>{console.log("done")});
					return await reply.json({fish: 16});
				}
			)))
		.get<{id:number}>('item/{id:number}', ["fish:number", "abort:boolean"], async (reply, {id, fish, abort})=>{
			return await reply.json({id: id});
		});

server.api('api').createClient()

server.start(80);
