import URL from 'url';
import http from 'http';
import fs from 'fs';

import AuthenticationAuthorizationSystem from './auth/AuthenticationAuthorizationSystem.js';
import MicrosoftAuth from "./auth/MicrosoftAuth.js";
import API from './api/API.js';
import Responder from './Responder.js';

let packagejson = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
let VERSION = packagejson.version;

/**
 * 
 * @callback handlerCallback
 * @param {Responder} res 
 * @param {*} args
 */

/**
 * 
 */
export default class Server{

	static Auth = {
		System: AuthenticationAuthorizationSystem,
		Microsoft: MicrosoftAuth,
		// Static auth types
		NO_AUTH: AuthenticationAuthorizationSystem.NONE
	};
	static Mimes = {
		html: 'text/html',
		js :'application/javascript',
		wasm: 'application/wasm',
		css: 'text/css',
		jpg: 'image/jpg',
		png: 'image/png',
		svg: 'image/svg+xml'
	}

	#api = {};

	#serve = {};

	/** @type {AuthenticationAuthorizationSystem} */
	#auth;

	verbose = true;

	/**
	 * 
	 * @param {String} name 
	 * @param {AuthenticationAuthorizationSystem} [auth]
	 * 
	 */
	constructor(name, auth = Server.Auth.NO_AUTH){
		this.name = name;

		this.#auth = auth;

		this.http = http.createServer(this.handle.bind(this));

	}

	start(port){
		// actually start the server
		this.http.listen(port, () => {
			if(this.verbose){
				console.log(`'${this.name}' server running at port ${port}`);
			}
		});
	}

	async stop(){
		return new Promise(res=>this.http.close(res))
	}

	/**
	 * 
	 * @param {String} username 
	 */
	async authorize(username){
		return this.#auth.perform(username);
	}

	/**
	 * Status endpoint response
	 */
	async status(){
		return {
			service: this.name,
			version: VERSION
		};
	}

	/**
	 * 
	 * Serve files in {folder} at {path}
	 * 
	 * @param {String} path 
	 * @param {String} folder 
	 * 
	 * @returns {Server}
	 */
	serve(path, folder){
		this.#serve[folder] = path;
		return this;
	}

	/**
	 * Create a symlink, useful for serving dist folders from node_modules
	 * 
	 * @param {*} folder 
	 * @param {*} path 
	 */
	link(folder, path){
		try{
			fs.symlinkSync(folder, path);
		}catch(e){
			
		}
		return this;
	}

	/**
	 * 
	 * @param {String} root 
	 * @param {AuthenticationAuthorizationSystem} auth 
	 * 
	 * @returns {API} API for extension
	 */ 
	api(root, auth = this.#auth){
		if(!root.startsWith('/')){
			root='/'+root;
		}
		if(!root.endsWith('/')){
			root+='/';
		}
		if(!this.#api[root]){
			this.#api[root] = new API(root, auth);
		}
		return this.#api[root];
	}

	/**
	 * 
	 * @param {http.IncomingMessage} req 
	 * @param {*} res 
	 */
	async handle(req, res){
		let reply = new Responder(req, res, null);
		try{
			// pre-process incoming request
			let parsedUrl = URL.parse(req.url.trim(), true);
			reply.path = parsedUrl.pathname;

			let method = req.method.toUpperCase();
			// path
			let path = URL.parse(req.url.trim(), true).pathname;
			if(!path.endsWith('/')){
				path += '/';
			}

			// check if request overlaps an API endpoint
			let apiRoot = Object.keys(this.#api).find(root=>path.toLowerCase().startsWith(root));
			if(apiRoot){
				let api = this.#api[apiRoot];
				return api.handle(method, path, req, reply);
			}

			// status endpoint
			if(parsedUrl.pathname == '/status'){
				return reply.json(await this.status());
			}
	
			// File endpoints

			// util to check path validity
			let valid = (path)=>{try{return fs.lstatSync(path).isFile()}catch(_){return false}}
	
			for(let prefix of Object.keys(this.#serve)){

				let requested = parsedUrl.pathname;

				if(requested.startsWith(this.#serve[prefix])){
					requested = requested.substring(this.#serve[prefix].length);
					// check if I need to serve a file
					let asset = prefix+'/'+requested;
					if(valid(asset)){
						return reply.file(asset);
					}else if(valid(asset + '.html')){
						return reply.file(asset + '.html');
					}else if(valid(asset + '/index.html')){
						return reply.file(asset + '/index.html');
					}
					/*asset = asset.substring(1,parsedUrl.pathname.indexOf('/',1)) + '.html';
					if(valid(asset)){
						return reply.file(asset);
					}*/
				}
			}
	
			//no data
			return reply.error("File not found", 404);
		}catch(e){
			if(this.verbose){
				console.warn(e);
			}
			return reply.error("Error handling request", 500);
		}
	}

	
}
