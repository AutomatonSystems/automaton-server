import URL from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import cluster from 'node:cluster';
import v8 from "v8";
import os from 'os';
import Path from 'path';

import AuthenticationAuthorizationSystem from './auth/AuthenticationAuthorizationSystem.js';
import MicrosoftAuth from "./auth/MicrosoftAuth.js";
import ServerApiEndpoint from './api/ServerApiEndpoint.js';
import Responder from './Responder.js';


let packagejson = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));

let RQ_ID = 0;

export enum StatusMode {
	DISABLED, // no /status endpoint
	BASIC, // basic info name,version
	EXTENDED // cpu and memory usage
}

export type AutomatonServerConfig = {
	name?: string
	version?: string
	statusMode?: StatusMode
	fileCaching?: boolean
	serveNodeModules?: false|string
	ReqResLogging?: boolean
	transpileTypescript?: boolean
}

// reexport the underlying auth systems
export {default as AuthenticationAuthorizationSystem} from './auth/AuthenticationAuthorizationSystem.js';
export {default as MicrosoftAuth} from "./auth/MicrosoftAuth.js";
export {default as ServerApiEndpoint} from './api/ServerApiEndpoint.js';
export {Body} from './api/RequestWrapper.js';
export type {FormFile} from './api/RequestWrapper.js';

export function metaname<T>(value: string, func: T){
	Object.defineProperty(func, "name", {value});
	return func;
}

export function metabody<T>(value: string, func: T){
	Object.defineProperty(func, "body", {value});
	return func;
}

export function metaresp<T>(value: string, func: T){
	Object.defineProperty(func, "resp", {value});
	return func;
}

/**
 * 
 */
export default class AutomatonServer{

	static Cluster(size: number, path: string): AutomatonServer{
		if(cluster.isPrimary){
			for(let s = 0; s < size; s++)
				cluster.fork();
			return null;
		}else{
			// otherwise...
			console.log("starting cluster worker " + process.pid);
			import(path);
		}
	}

	/**
	 * @deprecated
	 */
	static Auth = {
		System: AuthenticationAuthorizationSystem,
		Microsoft: MicrosoftAuth,
		// Static auth types
		NO_AUTH: AuthenticationAuthorizationSystem.NONE
	};
	static Mimes: Record<string, string>= {
		html: 'text/html',
		js :'application/javascript',
		ts :'application/javascript', // via transpilation
		wasm: 'application/wasm',
		css: 'text/css',
		jpg: 'image/jpg',
		png: 'image/png',
		svg: 'image/svg+xml'
	}

	static HEADERS: http.OutgoingHttpHeaders = {};

	config: AutomatonServerConfig = {
		name: packagejson.name,
		version: packagejson.version,
		statusMode: StatusMode.BASIC,
		fileCaching: false,
		serveNodeModules: false,
		ReqResLogging: false,
		transpileTypescript: true 
	};

	#api: Record<string, ServerApiEndpoint<unknown, unknown>> = {};

	#serve: {folder:string, path:string}[] = [];

	#auth: AuthenticationAuthorizationSystem<unknown,unknown> = AuthenticationAuthorizationSystem.NONE;

	verbose = true;
	http: http.Server;


	// /status endpoint config
	statusCache: any = null;


	#nodeModulesCache: Record<string, string> = {};

	/**
	 * 
	 * @param name 
	 * @param auth
	 * 
	 */
	constructor(){
		this.http = http.createServer(this.#handle.bind(this));
	}

	setName(name: string): AutomatonServer{
		this.config.name = name;
		return this;
	}

	setDefaultAuth(auth: AuthenticationAuthorizationSystem<unknown,unknown>){
		this.#auth = auth;
		return this;
	}

	start(port: number){
		// actually start the server
		this.http.listen(port, () => {
			if(this.verbose){
				console.log(`'${this.config.name}' server running at port ${port}`);
			}
		});
		return this;
	}

	async stop(){
		return new Promise(res=>this.http.close(res))
	}

	/**
	 * @deprecated
	 * @param {*} username 
	 */
	async authorize(username: any){
		return this.#auth.perform(username);
	}

	/**
	 * Status endpoint response
	 */
	async status(){
		if(this.config.statusMode == StatusMode.EXTENDED){
			if(this.statusCache == null || Date.now() > this.statusCache.expires){

				let heap = v8.getHeapStatistics();
				const MB = (number:number)=>(number/(1024*1024)).toFixed(1)+"MB";

				let cpuLoad = os.loadavg();

				this.statusCache = {
					value: {
						service: this.config.name,
						host: process.env.HOSTNAME ?? os.hostname(),
						version: this.config.version,
						cpuload: {
							"1min":cpuLoad[0],
							"5min":cpuLoad[1],
							"15min":cpuLoad[2]
						},
						memory: {
							max: MB(heap.heap_size_limit),
							current: MB(heap.used_heap_size)
						}
					},
					expires: Date.now() + 1000*60 // in one minute
				}
			}
			return this.statusCache.value;
		}else{
			return {
				service: this.config.name,
				host: process.env.HOSTNAME ?? os.hostname(),
				version: this.config.version
			};
		}
	}

	/**
	 * 
	 * Serve files in {folder} at {path}
	 * 
	 * @param path 
	 * @param folder 
	 * 
	 * @returns
	 */
	serve(path: string, folder: string){
		this.#serve.push({path,folder});
		return this;
	}

	serveNodeModules(path = 'libs'){
		this.config.serveNodeModules = '/' + path;
		this.serve('/' + path, './node_modules/');
		return this;
	}

	async getNodeModulesPath(lib: string): Promise<string>{
		if(!this.#nodeModulesCache[lib]){
			this.#nodeModulesCache[lib] = await new Promise(resolve=>{
				fs.readFile(`./node_modules/${lib}/package.json`, {encoding: 'utf8'}, (err, packageText)=>{
					if(err){
						// most likely it isn't a node_module afterall!
						return resolve(null);
					}
					let json = JSON.parse(packageText);
					let truepath = Path.join(this.config.serveNodeModules+'', '/', lib, json.main);
					truepath = truepath.replace(/\\/g, '/');
					resolve(truepath);
				});
			});
		}
		return this.#nodeModulesCache[lib];
	}

	/**
	 * Create a symlink, useful for serving individual dist folders from node_modules
	 * 
	 * @param folder 
	 * @param path 
	 * 
	 * @deprecated
	 */
	link(folder: string, path: string){
		try{
			fs.symlinkSync(folder, path);
		}catch(e){
			
		}
		return this;
	}

	api<User, Permissions>(root: string, auth:AuthenticationAuthorizationSystem<User, Permissions> = <AuthenticationAuthorizationSystem<User, Permissions>>this.#auth): ServerApiEndpoint<User, Permissions>{
		if(!root.startsWith('/')){
			root='/'+root;
		}
		if(!root.endsWith('/')){
			root+='/';
		}
		if(!this.#api[root]){
			this.#api[root] = new ServerApiEndpoint(this, root, auth);
		}
		return <ServerApiEndpoint<User, Permissions>>this.#api[root];
	}

	/**
	 * 
	 * @param req 
	 * @param res 
	 */
	async #handle(req: http.IncomingMessage, res: http.ServerResponse){
		let rid = RQ_ID++;
		if(this.config.ReqResLogging){
			console.debug(`${rid} -> ${req.url.trim()}`);
		}
		let reply = new Responder(this, rid, req, res);
		try{
			// pre-process incoming request
			let parsedUrl = URL.parse(req.url.trim(), true);
			reply.path = parsedUrl.pathname;

			let method = req.method.toUpperCase();
			// path
			let path = parsedUrl.pathname;
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
			if(parsedUrl.pathname == '/status' && this.config.statusMode!=StatusMode.DISABLED){
				return reply.json(await this.status());
			}
	
			// File endpoints

			// util to check path validity
			let valid = (path:string)=>{try{return fs.lstatSync(path).isFile()}catch(_){return false}}

			for(let {path, folder} of this.#serve){
				
				let requested = parsedUrl.pathname;

				if(requested.startsWith(path)){
					requested = requested.substring(path.length);
					// check if I need to serve a file 
					let asset = folder+'/'+requested;

					let dynamic = reply.getDynamic(asset);
					if(dynamic){
						return reply.file(asset, {srcpath: requested});
					}else if(valid(asset)){
						return reply.file(asset, {srcpath: requested});
					}else if(valid(asset.replace(".js", ".ts"))){
						return reply.file(asset.replace(".js", ".ts"), {srcpath: requested});
					}else if(valid(asset + '.html')){
						return reply.file(asset + '.html');
					}else if(valid(asset + '/index.html')){
						return reply.file(asset + '/index.html');
					}
				}
			}
	
			console.warn("404", path)

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
