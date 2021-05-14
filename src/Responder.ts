import fs from 'fs';
import zlib from 'zlib';
import Server from './AutomatonServer.js';
import http from 'http';


type Json =  null | string | number | boolean | Json [] |  { [key: string]: Json };

/**
 * Wrapper class to make returning various common patterns a simple async call
 */
export default class Responder {

	request: http.IncomingMessage;

	response;

	#fileCache: Record<string, {lastModified:Date, content: Buffer}> = {};
	path: string;

	constructor(request: http.IncomingMessage, response: http.ServerResponse, path: string) {
		this.request = request;
		this.response = response;
		this.path = path;
	}


	/**
	 * 
	 * Return an error message
	 * 
	 * @param info 
	 * @param code 
	 */
	async error(info: any, code = 500) {

		return await this.json({ "error": info, "path": this.path }, { status: code });
	}

	/**
	 * 
	 * Return a json response
	 * 
	 * @param html 
	 * @param opts 
	 */
	async html(html: string, { status = 200, zip = false, cors = false } = {}) {
		return await this.raw(html, { encoding: 'utf8', status, zip, cors });
	}

	/**
	 * 
	 * Return a json response
	 * 
	 * @param json 
	 * @param opts 
	 */
	async json(json: Json, { status = 200, zip = false, cors = false } = {}) {
		return await this.raw(JSON.stringify(json, null, '\t'), { encoding: 'utf8', status, zip, cors });
	}

    /**
     * Return a file as a response, optionally zipping it first
	 * 
     * @param path
     * @param opts
     */
	async file(path: string, { status = 200, zip = false, cors = false, unzip = false} = {}) {
		let ext = path.substring(path.lastIndexOf('.') + 1);
		ext=ext.replace('/', '').toLocaleLowerCase();
		let mime = Server.Mimes[ext] || 'text/plain';

		let lastModified: Date= null;

		let params: any = { encoding: 'utf8', status, zip, cors, type: mime, headers: unzip?{'content-encoding':'gzip'}:{}};

		if(Server.FILE_CACHING){
			let lastModified = fs.statSync(path).mtime;
			lastModified.setMilliseconds(0);
			params.lastModified = lastModified;
			// check if last modified
			let d = this.request.headers['if-modified-since'];
			if(d){
				let remoteDate = new Date(d);
				if(lastModified <= remoteDate){
					return this.raw(null, {status: 304});
				}
			}

			let cache = this.#fileCache[path];
			
			if(cache?.lastModified <= lastModified){
				// return the cached file
				return this.raw(cache.content, params);
			}
		}

		// we need to (re)read and cache the file
		return new Promise(
			resolvePromise => {
				// send back the file
				fs.readFile(path, async (_, content) => {
					// cache the file
					if(lastModified)
						this.#fileCache[path] = {lastModified, content};
					// send reponse
					let rawSent = await this.raw(content, params);
					resolvePromise(rawSent);
				});
			}
		);
	}


	/**
	 * 
	 * @param buffer 
	 * @param param1 
	 */
	async raw(buffer: Buffer | string, { encoding = null as BufferEncoding, status = 200, zip = false, cors = false, type = 'application/json', lastModified = null, headers = {} }) {
		let respHeaders = Object.assign({}, Server.HEADERS) as http.OutgoingHttpHeaders;

		respHeaders['Content-Type'] = type;
		if (cors) {
			respHeaders['Access-Control-Allow-Origin'] = '*';
		}

		if (lastModified){
			respHeaders['Last-Modified'] = lastModified.toUTCString();
		}

		Object.assign(respHeaders, headers);

		if (zip) {
			respHeaders['content-encoding'] = 'gzip';
			buffer = await new Promise(resZip => zlib.gzip(buffer, (_, result) => resZip(result)));
			encoding = 'binary';
		}

		this.response.writeHead(status, respHeaders);
		this.response.end(buffer, encoding);

		return true;
	}
}