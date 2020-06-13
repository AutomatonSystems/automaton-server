import URL from 'url';
import http from 'http';
import fs from 'fs';
import zlib from 'zlib';
import Path from 'path';

import {AuthenticationAuthorizationSystem, NO_AUTH, MicrosoftAuth} from './AuthenticationAuthorizationSystem.js';

let packagejson = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
let VERSION = packagejson.version;

/**
 * @typedef {{func:handlerCallback, body?: String, auth?: AuthenticationAuthorizationSystem}} handlerOptions
 * 
 */

/**
 * 
 * @callback handlerCallback
 * @param {Responder} res 
 * @param {*} args
 */

export default class Server{

	static Auth = {
		System: AuthenticationAuthorizationSystem,
		Microsoft: MicrosoftAuth,
		// Static auth types
		NO_AUTH: NO_AUTH
	};

	#api = {};

	/** @type {AuthenticationAuthorizationSystem} */
	#auth;

	/**
	 * 
	 * @param {String} name 
	 * @param {AuthenticationAuthorizationSystem} [auth]
	 * 
	 */
	constructor(name, auth = NO_AUTH){
		this.name = name;

		this.#auth = auth;

		this.http = http.createServer(this.handle.bind(this));

	}

	start(port){
		// actually start the server
		this.http.listen(port, () => {
			console.log(`'${this.name}' server running at port ${port}`);
		});
	}

	/**
	 * 
	 * @param {String} username 
	 */
	async authorize(username){
		return this.#auth.perform(username);
	}

	async status(){
		return {};
	}

	api(root, auth = this.#auth){
		if(!this.#api[root]){
			this.#api[root] = new API(this, root, auth);
		}
		return this.#api[root];
	}

	async handle(req, res){
		let reply = new Responder(res, null);
		try{
			let parsedUrl = URL.parse(req.url.trim(), true);
			reply.path = parsedUrl.pathname;

			let method = req.method.toUpperCase();
			let path = URL.parse(req.url.trim(), true)
						.pathname
						.toLowerCase();
			if(path.endsWith('/'))
				path = path.substring(0,path.length-1);
	
			let [,root] = path.split('/');

			let request = new RequestWrapper(req);
	
			// API endpoints
			if(this.#api[root]){
				return this.#api[root].handle(method, path, request, reply);
			}

			// status endpoint
			if(parsedUrl.pathname == '/status'){
				return reply.json({
					service: this.name,
					version: VERSION,
					status: "Service is online!"
				});
			}
	
			// UI endpoints
			if(parsedUrl.pathname == '/basic.js'){
				return reply.file(Path.resolve(__dirname, '/basic.js'));
			}

			let valid = (path)=>{try{return fs.lstatSync(path).isFile()}catch(_){return false}}
	
			// check if I need to serve a file
			let asset = './public/'+parsedUrl.pathname;
			if(valid(asset)){
				return reply.file(asset);
			}else if(valid(asset + '.html')){
				return reply.file(asset + '.html');
			}else if(valid(asset + '/index.html')){
				return reply.file(asset + '/index.html');
			}
			asset = './public/' + parsedUrl.pathname.substring(1,parsedUrl.pathname.indexOf('/',1)) + '.html';
			if(valid(asset)){
				return reply.file(asset);
			}
	
			//no data
			return reply.error("File not found", 404);
		}catch(e){
			console.warn(e);
			return reply.error("Error handling request", 500);
		}
	}

	
}

class API{

	root;

	/**
	 * @type {Handler[]}
	 */
	#handlers = [];
	#auth;

	constructor(server, root, auth){
		this.server = server;
		this.root = root;
		this.#auth = auth;
	}

	async handle(method, path, request, responder){
		for(let handler of this.#handlers){
			if(await handler.handle(method, path, request, responder))
				return true;
		}
		return responder.error('Endpoint not recognized', 404);
	}

	/**
	 * 
	 * @param {String} method
	 * @param {String} path
	 * @param {...handlerCallback|AuthenticationAuthorizationSystem|String|String[]} args
	 */
	endpoint(method, path, ...args){
		let auth = this.#auth;
		let func;
		let body = null;
		let params = [];
		for(let arg of args){
			if(typeof arg == 'function'){
				func = arg;
			}else if(typeof arg == "string"){
				body = arg;
			}else if(Array.isArray(arg)){
				params = arg;
			}else if(typeof arg == 'object'){
				auth = arg;
			}
		}
		
		this.#handlers.push(new Handler(path, method, body, auth, params, func));
		return this;
	}

	/**
	 * 
	 * Create a new API get endpoint
	 * 
	 * @param {String} path
	 * @param {...handlerCallback|AuthenticationAuthorizationSystem|String|String[]} args
	 */
	get(path, ...args){
		return this.endpoint("GET",  path, ...args);
	}

	/**
	 * 
	 * create a new API post endpoint
	 * 
	 * @param {String} path
	 * @param {...handlerCallback|AuthenticationAuthorizationSystem|String|String[]} args
	 */
	post(path, ...args){
		return this.endpoint("POST", path, ...args);
	}
}

class Responder{

	response;

	constructor(response, path){
		this.response = response;
		this.path = path;
	}

	async error(info, code=500){
		return await this.json({"error": info, "path": this.path}, {status: code});
	}

	async json(json, {status= 200, zip= false, cors=false}={}){
		return await this.raw(JSON.stringify(json, null, '\t'),{status, zip, cors});
	}
	
	async file(path, {status= 200, zip= false, cors=false}={}){
		let mime = 'text/html';
		if(path.endsWith('js')) {
			mime = 'application/javascript';
		}
		if(path.endsWith('css')) {
			mime = 'text/css';
		}
		return await new Promise(resFile => 
			fs.readFile(path, async (_, content) =>{
				resFile(await this.raw(content,{status, zip, cors, type: mime}));
			}));
	}

	async raw(buffer, {status= 200, zip= false, cors=false, type='application/json'}){
		let headers = {'Content-Type': type};
		if(cors) {
			headers['Access-Control-Allow-Origin'] = '*';
		}
		let utf8 = true;
		if(zip){
			headers['content-encoding'] = 'gzip';
			buffer = await new Promise(resZip => 
				zlib.gzip(buffer, (_, result) => {
					resZip(result);
				}));
			utf8 = false;
		}

		this.response.writeHead(status, headers);
		this.response.end(buffer, utf8?'utf-8':null);

		return true;
	}
}

class RequestWrapper{
	constructor(req){
		this.req = req;
		this.parsed = URL.parse(req.url.trim(), true);
		this.authCache = [];
	}

	async getAuth(auth){
		if(this.authCache[auth.id]==null){
			this.authCache[auth.id] = await auth.perform(this.req);
		}
		return this.authCache[auth.id];
	}

	
	param(v) {
		return this.parsed.query[v];
	}

	async readBody(format){
		switch(format){
			// grab the text/json from a post body
			case 'JSON':
			case 'STRING':{
				let text = await new Promise((res)=>{
						var string = '';
						this.req.on('data', function (data) {
							string += data;
						});
						this.req.on('end', function () {
							res(string);
						});
					});
				if(format=='json')
					return JSON.parse(text);
				return text;
			}
			case 'BLOB':{
				return new Promise((res)=>{
					var data = [];
					this.req.on('data', function(chunk) {
						data.push(chunk);
					}).on('end', function() {
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

class Handler{

	/** @type {RegExp}*/
	path;

	pathVariables = [];
	queryVariables = [];

	body = null;

	/** @type {String} */
	method;

	/** @type {handlerCallback} */
	func;

	#auth;

	constructor(path, method, body, auth, params, func){
		// extract path args
		while(path.includes('{')){
			let variable = path.substring(path.indexOf('{'), path.indexOf('}')+1);
			path = path.replace(variable, "([^/]*)");
			this.pathVariables.push(Handler.v(variable.substring(1,variable.length-1)));
		}
		// add query params
		this.queryVariables = params.map(v=>Handler.v(v));
		
		// read off how the request body should be used
		this.body = body;

		// auth system to 
		this.#auth = auth;

		this.path = new RegExp(path);
		this.method = method;
	
		this.func = func;
	}

	static v(input){
		let [name,type] = input.split(':');
		return {
			name: name,
			set: (obj, value)=>{
				if(!value)
					return;
				switch(type){
					case 'number':
						value = parseFloat(value);
						break;
					case 'boolean':
						value = (value.toLowerCase() == 'true');	
						break;
					case 'json':
						value = JSON.parse(value);	
						break;
				}
				obj[name] = value;
			}
		}
		
	}

	/**
     * @param {String} method 
	 * @param {String} path 
	 * @param {RequestWrapper} request 
	 * @param {Responder} reply 
	 * 
	 * @returns {Promise<Boolean>}
	 */
	async handle(method, path, request, reply){
		if(this.method != method)
			return false;

		let parts = path.match(this.path);
		if(!parts)
			return false;

		// check AUTH
		let user = await request.getAuth(this.#auth);
		if(user == null)
			return await reply.error("Permission denied", 403);

		// compute vars
		let args = {};
		parts.shift();
		for(let v of this.pathVariables)
			v.set(args, decodeURI(parts.shift()));

		// compute query params
		for(let v of this.queryVariables)
			v.set(args, request.param(v.name));

		// add permissions
		args['permissions'] = user.permissions;

		// grab the body if requested
		if(this.body){
			args.body = await request.readBody(this.body);
		}

		// and call the function
		return await this.func(reply, args);
	}
}