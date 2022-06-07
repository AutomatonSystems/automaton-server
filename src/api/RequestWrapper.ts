import URL from 'url';
import {IncomingMessage} from 'http';
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import Busboy from 'busboy';

export type JsonObject = { [index: string]: null | string | number | boolean | JsonObject [] | JsonObject | Buffer | Date}

type BodyFormat = "JSON"|"STRING"|"BLOB"|"FORM";
type BodyType<T> = 
	T extends "STRING" ? string :
	T extends "BLOB" ? Buffer
	: JsonObject;

/**
 * Wraps incoming request with simple parsing logic
 */
export default class RequestWrapper {
	req: IncomingMessage;
	parsed: URL.UrlWithParsedQuery;
	authCache: any[];

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
	async getAuth(auth: AuthenticationAuthorizationSystem) {
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
	async readBody<T extends BodyFormat>(format: T): Promise<BodyType<T>> {
		switch(format.toUpperCase()) {
			// grab the text/json from a post body
			case 'JSON':
			case 'STRING': {
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
			case 'FORM': {
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
						this.req.pipe(<any>busboy);
					}catch(e){
						console.warn("Failed to parse FORM body\n", e);
						res(null);
					}
				});
			}
			case 'BLOB': {
				return new Promise((res) => {
					let data: any[] = [];
					this.req.on('data', (chunk)=>{
						data.push(chunk);
					}).on('end', ()=>{
						res(Buffer.concat(data) as BodyType<T>);
					});
				});
			}
		}
	}
}
