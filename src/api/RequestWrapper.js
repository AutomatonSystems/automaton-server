import URL from 'url';
import http from 'http';
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import Busboy from 'busboy';

/**
 * Wraps incoming request with simple parsing logic
 */
export default class RequestWrapper {

	/**
	 * 
	 * @param {http.IncomingMessage} req 
	 */
	constructor(req) {
		this.req = req;
		this.parsed = URL.parse(req.url.trim(), true);
		this.authCache = [];
	}


	/**
	 * Perform authentication and authorization for the query
	 * 
	 * @param {AuthenticationAuthorizationSystem} auth 
	 */
	async getAuth(auth) {
		if (this.authCache[auth.id] == null) {
			this.authCache[auth.id] = await auth.perform(this.req);
		}
		return this.authCache[auth.id];
	}


	/**
	 * 
	 * Read a query parameter from the request
	 * 
	 * @param {String} v 
	 */
	param(v) {
		return this.parsed.query[v];
	}


	/**
	 * 
	 * Extract the body of the request in the supplied format
	 * 
	 * @param {"JSON"|"STRING"|"BLOB"} format 
	 */
	async readBody(format) {
		switch (format.toLowerCase()) {
			// grab the text/json from a post body
			case 'json':
			case 'string': {
				let text = await new Promise((res) => {
					var string = '';
					this.req.on('data', function (data) {
						string += data;
					});
					this.req.on('end', function () {
						res(string);
					});
				});
				if (format.toLowerCase() == 'json')
					return JSON.parse(text);
				return text;
			}
			case 'form': {
				return new Promise((res) => {
					let obj = {};
					let promises = [];
					let busboy = new Busboy({headers: this.req.headers});
					busboy.on('file', (fieldname, file, filename, encoding, mimetype)=>{
						promises.push((async ()=>{
							// read the bytes of the file
							const data = [];
							for await (let bytes of file) {
								data.push(bytes);
							}
							// add the file to our response object
							obj[fieldname] = {
								name: filename,
								data: Buffer.concat(/** @type {*} */(data)),
								encoding,
								mimetype
							}
						})());
					});
					busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
						obj[fieldname] = val;
					});
					busboy.on('finish', ()=>{
						Promise.allSettled(promises).then(()=>res(obj));
					});
					this.req.pipe(busboy);
				});
			}
			case 'blob': {
				return new Promise((res) => {
					var data = [];
					this.req.on('data', function (chunk) {
						data.push(chunk);
					}).on('end', function () {
						//at this point data is an array of Buffers
						//so Buffer.concat() can make us a new Buffer
						//of all of them together
						var buffer = Buffer.concat(data);
						res(buffer);
					});
				});
			}
		}
	}
}
