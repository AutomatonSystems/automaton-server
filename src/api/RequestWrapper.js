import URL from 'url';
import http from 'http';
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';

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
		switch (format) {
			// grab the text/json from a post body
			case 'JSON':
			case 'STRING': {
				let text = await new Promise((res) => {
					var string = '';
					this.req.on('data', function (data) {
						string += data;
					});
					this.req.on('end', function () {
						res(string);
					});
				});
				if (format == 'JSON')
					return JSON.parse(text);
				return text;
			}
			case 'BLOB': {
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
			/*case 'FORM': {
				new FormData();
			}*/
		}
	}
}
