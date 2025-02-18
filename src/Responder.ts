import fs from 'fs';
import zlib from 'zlib';
import Server from './AutomatonServer.js';
import http from 'http';
import ts, { ModuleKind, ScriptTarget } from "typescript";
import AutomatonServer from './AutomatonServer.js';
type Json =  null | string | number | boolean | Json [] |  Date | { [key: string]: Json };

const fileCache: Record<string, {lastModified:Date, content: Buffer}> = {};
const dynamicFiles: Record<string, Buffer> = {};

/**
 * Wrapper class to make returning various common patterns a simple async call
 */
export default class Responder<R> {

	rid: number;
	start = Date.now();
	request: http.IncomingMessage;
	response;

	path: string;
	server: AutomatonServer;

	constructor(server: AutomatonServer, rid: number, request: http.IncomingMessage, response: http.ServerResponse) {
		this.rid = rid;
		this.server = server;
		this.request = request;
		this.response = response;
	}

	/**
	 * 
	 * Return an error message
	 * 
	 * @param info 
	 * @param code 
	 */
	async error(info: any, code = 500) {
		return await this.json(<R>{ "error": info, "path": this.path }, { status: code });
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
	async json(json: R, { status = 200, zip = false, cors = false } = {}) {
		return await this.raw(JSON.stringify(json, null, '\t'), { encoding: 'utf8', status, zip, cors });
	}

	getDynamic(path: string){
		return dynamicFiles[path];
	}

    /**
     * Return a file as a response, optionally zipping it first
	 * 
     * @param path
     * @param opts
     */
	async file(path: string, { status = 200, zip = false, cors = false, unzip = false, originalpath = path} = {}) {
		let ext = path.substring(path.lastIndexOf('.') + 1);
		ext = ext.replace('/', '').toLocaleLowerCase();
		let mime = Server.Mimes[ext] || 'text/plain';

		let lastModified: Date= null;

		let params: any = { encoding: 'utf8', status, zip, cors, type: mime, headers: unzip?{'content-encoding':'gzip'}:{}};

		if(this.getDynamic(path)){
			return await this.raw(this.getDynamic(path), params);
		}

		if(this.server.config.fileCaching){
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

			let cache = fileCache[path];
			
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
					// node_modules rewrites
					if(this.server.config.serveNodeModules && (path.endsWith(".js") || path.endsWith(".ts"))){
						let text = content.toString('utf8');
						// find imports that are from node_modules - IE ones that don't have a . or / character
						// import something from "a-package";
						let matches = [...text.matchAll(/import ((.*) from )?["']([^.\/].*)['"];?/g)];
						let active = false;
						for(let pattern of matches){
							// grab the library name form out regexp
							let lib = pattern[3];
							if(lib.startsWith('#'))
								lib = lib.substring(1);
							// resolve it to a node_module path
							let truepath = await this.server.getNodeModulesPath(lib);
							// if we found it...
							if(truepath){
								text = text.replace(pattern[0], `import ${pattern[1]?pattern[1]:''}"${truepath}";`);
								active = true;
							}
						}
						matches = [...text.matchAll(/import\(["']([^.\/].*)['"]\)/g)];
						for(let pattern of matches){
							// grab the library name form out regexp
							let lib = pattern[1];
							if(lib.startsWith('#'))
								lib = lib.substring(1);
							// resolve it to a node_module path
							let truepath = await this.server.getNodeModulesPath(lib);
							// if we found it...
							if(truepath){
								text = text.replace(pattern[0], `import ("${truepath}")`);
								active = true;
							}
						}
						if(active){
							content = Buffer.from(text,'utf8');
						}
					}

					// transpile
					// TODO rewrite accidental .ts imports (or extensionless!)
					if(this.server.config.transpileTypescript && path.endsWith(".ts") && originalpath.endsWith(".js")){
						// store ts
						let inputtext = content.toString('utf8');
						let output = ts.transpileModule(inputtext, {
							fileName: originalpath.replace(".js", ".ts"),
							compilerOptions: {
								target: ScriptTarget.ES2024,
								sourceMap: true
							}
						});
						// transpiled TS
						content = Buffer.from(output.outputText,'utf8');
						// source map
						dynamicFiles[path.replace(".ts", ".js.map")] = Buffer.from(output.sourceMapText, 'utf8');
					}

					// cache the file
					if(lastModified)
						fileCache[path] = {lastModified, content};
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
			buffer = await new Promise(resZip => zlib.gzip(<any>buffer, (_, result) => resZip(result)));
			encoding = 'binary';
		}

		this.response.writeHead(status, respHeaders);
		this.response.end(buffer, encoding);

		if(this.server.config.ReqResLogging){
			console.debug(`${this.rid} <- ${status} (${Math.floor(Date.now() - this.start).toLocaleString()}ms)`);
		}

		return true;
	}
}
