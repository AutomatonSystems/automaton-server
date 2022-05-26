import URL from 'url';
import {IncomingMessage} from 'http';
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import Busboy from 'busboy';
import buffer from "buffer";
import { Stream } from 'stream';
export type JsonObject = { [index: string]: null | string | number | boolean | JsonObject [] | JsonObject | Buffer | Date}

export enum Body{
	NONE= "NONE",
	JSON="JSON",
	STRING="STRING",
	BLOB="BLOB",
	FORM="FORM",
	STREAM="STREAM"
} 
export type BodyType<T> = 
	T extends "NONE" ? void :
	T extends "STRING" ? string :
	T extends "STREAM" ? Stream :
	T extends "BLOB" ? Buffer
	: JsonObject;

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


	/**
	 * 
	 * Extract the body of the request in the supplied format
	 * 
	 * @param format 
	 */
	async readBody<T extends Body>(format: T): Promise<BodyType<T>> {
		switch(format) {
			case Body.NONE:{
				return null;
			}
			// grab the text/json from a post body
			case Body.JSON:
			case Body.STRING: {
				let text: string = await new Promise((res) => {
					var string = '';
					this.req
						.on('data', data=>{
							string += data;
						}).on('end', ()=>{
							res(string);
						});
				});
				if (format.toUpperCase() == 'JSON')
					return JSON.parse(text) as BodyType<T>;
				return text as BodyType<T>;
			}
			case Body.FORM: {
				return new Promise((res) => {
					let obj = {} as JsonObject;
					let promises: Promise<void>[] = [];
					try{
						let busboy = Busboy({headers: this.req.headers});
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
								Promise.allSettled(promises).then(()=>res(obj as BodyType<T>));
							});
						this.req.pipe(busboy);
					}catch(e){
						console.warn("Failed to parse FORM body\n", e);
						res(null);
					}
				});
			}
			case Body.BLOB: {
				return new Promise((res) => {
					console.log("blob")
					console.log(buffer.constants.MAX_LENGTH.toLocaleString());
					let data: any[] = [];
					this.req.on('data', (chunk)=>{
						data.push(chunk);
					}).on('end', ()=>{
						let length = data.map(b=>b.length).reduce((t,v)=>t+v, 0);
						console.log("buffer length", length.toLocaleString());
						res(Buffer.concat(data) as BodyType<T>);
					});
				});
			}
			case Body.STREAM: {
				return new Promise((res) => {
					let stream: Stream = this.req;
					res(stream as BodyType<T>);
				});
			}
		}
	}
}
