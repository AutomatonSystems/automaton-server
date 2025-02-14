import URL from 'url';
import {IncomingMessage} from 'http';
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import Busboy from 'busboy';
import buffer from "buffer";
import { Stream } from 'stream';

async function JSONParse<T>(req:IncomingMessage):Promise<T>{
	let text: string = await new Promise((res) => {
		var string = '';
		req.on('data', data=>{
			string += data;
		}).on('end', ()=>{
			res(string);
		});
	});
	return JSON.parse(text) as T;
}

async function StringParse(req:IncomingMessage):Promise<string>{
	let text: string = await new Promise((res) => {
		var string = '';
		req.on('data', data=>{
			string += data;
		}).on('end', ()=>{
			res(string);
		});
	});
	return text;
}

export type FormFile = {
	name: string,
	data: Buffer|string
	encoding: string
	mimeType: string
}

async function FormBodyParse<T>(req: IncomingMessage):Promise<T>{
	return new Promise((res) => {
		let obj: any = {};
		let promises: Promise<void>[] = [];
		try{
			let busboy = Busboy({headers: req.headers});
			busboy
				.on('file', (fieldname, file, info)=>{
					const { filename, encoding, mimeType } = info;
					promises.push((async ()=>{
						// read the bytes of the file
						let data = [];
						let text = "";
						for await (let bytes of file) {
							if(typeof bytes == "string"){
								text += bytes;
							}else{
								data.push(bytes);
							}
						}
						// add the file to our response object
						obj[fieldname] = {
							name: filename,
							data: data.length?Buffer.concat(data):text,
							encoding,
							mimeType
						}
					})());
				})
				.on('field', (fieldname, val)=>{
					obj[fieldname] = val;
				})
				.on('close', ()=>{
					Promise.allSettled(promises).then(()=>res(obj as T));
				});
			this.req.pipe(<any>busboy);
		}catch(e){
			console.warn("Failed to parse FORM body\n", e);
			res(null);
		}
	});
}

async function BlobBodyParse(req: IncomingMessage):Promise<Buffer>{
	return new Promise((res) => {
		console.log("blob")
		console.log(buffer.constants.MAX_LENGTH.toLocaleString());
		let data: any[] = [];
		req.on('data', (chunk)=>{
			data.push(chunk);
		}).on('end', ()=>{
			let length = data.map(b=>b.length).reduce((t,v)=>t+v, 0);
			console.log("buffer length", length.toLocaleString());
			res(Buffer.concat(data) as Buffer);
		});
	});
}

async function StreamBodyParse(req: IncomingMessage): Promise<Stream>{
	return new Promise((res) => {
		let stream: Stream = this.req;
		res(stream);
	});
}

export type BodyParser<X> = ((req:IncomingMessage)=>Promise<X>) | ((req:IncomingMessage)=>X);

export const Body = {
	NONE: <BodyParser<null>>(():null=>null),
	JSON: JSONParse,
	STRING: <BodyParser<string>>StringParse,
	FORM: FormBodyParse,
	BLOB: <BodyParser<Buffer>>BlobBodyParse,
	STREAM: <BodyParser<Stream>>StreamBodyParse
};

/**
 * Wraps incoming request with simple parsing logic
 */
export default class RequestWrapper<User, Permission> {
	req: IncomingMessage;
	parsed: URL.UrlWithParsedQuery;
	authCache: {
		user: User;
		permissions: Permission;
	}[];

	/**
	 * 
	 * @param req 
	 */
	constructor(req: IncomingMessage) {
		this.req = req;
		this.parsed = URL.parse(req.url.trim(), true);
		this.authCache = [];
	}


	/**
	 * Perform authentication and authorization for the query
	 * 
	 * @param auth 
	 */
	async getAuth(auth: AuthenticationAuthorizationSystem<User, Permission>) {
		if (this.authCache[auth.id] == null) {
			this.authCache[auth.id] = await auth.perform(this.req);
		}
		return this.authCache[auth.id];
	}

	/**
	 * 
	 * Read a query parameter from the request
	 * 
	 * @param v 
	 */
	param(v: string) {
		return this.parsed.query[v];
	}
}
