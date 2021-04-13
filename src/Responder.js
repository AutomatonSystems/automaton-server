import fs from 'fs';
import zlib from 'zlib';
import Server from './Server.js';
import http from 'http';


/**
 * Wrapper class to make returning various common patterns a simple async call
 */
export default class Responder {

	/**
	 * @type {http.IncomingMessage}
	 */
	request;

	response;

	#fileCache = {};

	/**
	 * 
	 * @param {http.IncomingMessage} request 
	 * @param {*} response 
	 * @param {*} path 
	 */
	constructor(request, response, path) {
		this.request = request;
		this.response = response;
		this.path = path;
	}


	/**
	 * 
	 * Return an error message
	 * 
	 * @param {*} info 
	 * @param {*} code 
	 */
	async error(info, code = 500) {
		return await this.json({ "error": info, "path": this.path }, { status: code });
	}

	/**
	 * 
	 * Return a json response
	 * 
	 * @param {*} html 
	 * @param {{status?: number, zip?: boolean, cors?: boolean}} param1 
	 */
	async html(html, { status = 200, zip = false, cors = false } = {}) {
		return await this.raw(html, { encoding: 'utf8', status, zip, cors });
	}

	/**
	 * 
	 * Return a json response
	 * 
	 * @param {*} json 
	 * @param {{status?: number, zip?: boolean, cors?: boolean}} param1 
	 */
	async json(json, { status = 200, zip = false, cors = false } = {}) {
		return await this.raw(JSON.stringify(json, null, '\t'), { encoding: 'utf8', status, zip, cors });
	}

    /**
     *
     * @param {String} path
     * @param {{status?: number, zip?: boolean, cors?: boolean, unzip?: boolean}} param1
     */
	async file(path, { status = 200, zip = false, cors = false, unzip = false} = {}) {
		let ext = path.substring(path.lastIndexOf('.') + 1);
		ext=ext.replace('/', '').toLocaleLowerCase();
		let mime = Server.Mimes[ext] || 'text/plain';

		let lastModified = null;

		let params = { encoding: 'utf8', status, zip, cors, type: mime, headers: unzip?{'content-encoding':'gzip'}:{}};

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
	 * @param {*} buffer 
	 * @param {{lastModified?: Date, encoding?: String, status?: number, zip?: Boolean, cors?: boolean, type?: String, headers?: *}} param1 
	 */
	async raw(buffer, { encoding = null, status = 200, zip = false, cors = false, type = 'application/json', lastModified = null, headers = {} }) {
		let respHeaders = Object.assign({}, Server.HEADERS);

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
			buffer = await new Promise(resZip => zlib.gzip(buffer, (_, result) => {
				resZip(result);
			}));
			encoding = 'binary';
		}

		this.response.writeHead(status, respHeaders);
		this.response.end(buffer, encoding);

		return true;
	}
}
