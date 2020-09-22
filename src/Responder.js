import fs from 'fs';
import zlib from 'zlib';
import Server from './Server.js';

/**
 * Wrapper class to make returning various common patterns a simple async call
 */
export default class Responder {
	response;

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
     * @param {{status?: number, zip?: boolean, cors?: boolean}} param1
     */
	async file(path, { status = 200, zip = false, cors = false } = {}) {
		let ext = path.substring(path.lastIndexOf('.') + 1);
		let mime = Server.Mimes[ext] || 'text/plain';
		return await new Promise(resFile => fs.readFile(path, async (_, content) => {
			resFile(await this.raw(content, { encoding: 'utf8', status, zip, cors, type: mime }));
		}));
	}


	async raw(buffer, { encoding = null, status = 200, zip = false, cors = false, type = 'application/json', headers = {} }) {
		headers['Content-Type'] = type;
		if (cors) {
			headers['Access-Control-Allow-Origin'] = '*';
		}
		if (zip) {
			headers['content-encoding'] = 'gzip';
			buffer = await new Promise(resZip => zlib.gzip(buffer, (_, result) => {
				resZip(result);
			}));
			encoding = 'binary';
		}

		this.response.writeHead(status, headers);
		this.response.end(buffer, encoding);

		return true;
	}
}
