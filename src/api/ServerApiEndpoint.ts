import Handler, { HandlerCallback, HandlerJ, JHandlerCallback, VariableFactory } from "./Handler.js";
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import Responder from "../Responder.js";

import RequestWrapper, { Body, BodyParser, BSONParse } from './RequestWrapper.js';
import http from 'http';
import AutomatonServer from "../AutomatonServer.js";

type TOKENS = typeof STANDARD_JSON;

type EndpointOption<User, Permissions, X, R> = (AuthenticationAuthorizationSystem<User, Permissions>|string[]|Meta|HandlerCallback<User, Permissions, X, R>);
type BodylessEndpointOption<User, Permissions, R> = (AuthenticationAuthorizationSystem<User, Permissions>|string[]|Meta|HandlerCallback<User, Permissions, unknown, R>);

type EndpointOptionJ<User, Permissions, X, R> = (AuthenticationAuthorizationSystem<User, Permissions>|string[]|Meta|TOKENS|JHandlerCallback<User, Permissions, X, R>);
type BodylessEndpointOptionJ<User, Permissions, R> = (AuthenticationAuthorizationSystem<User, Permissions>|string[]|Meta|TOKENS|JHandlerCallback<User, Permissions, unknown, R>);


export function $returns(value: string|any){
	return new Meta(value, "resp");
}

export function $name(value: string){
	return new Meta(value, "name");
}

export function $body(value: string){
	return new Meta(value, "body");
}

const $meta = {
	name: $name,
	body: $body,
	returns: $returns
}

export {$meta}

// stand format automaton JSON response
export type AutomatonJsonResponse<T> = {
	"status": "ok",
	took?: number
	"data": T
} | {
	"status": "error",
	path?: string,
	took?: number
	"error": string|string[]
}

const STANDARD_JSON = Symbol("AutomatonJsonResponse");

class Meta{
	value: any;
	type: string;
	constructor(value: any, type:string){
		this.value = value;
		this.type = type;
	}

	apply(callback: HandlerCallback<any,any,any,any>): HandlerCallback<any,any,any,any>{
		Object.defineProperty(callback, this.type, {value: this.value});
		return callback;
	}
}

/**
  * 
  */
export default class ServerApiEndpoint<User, Permissions> {
	#root: string;
	#handlers: Handler<unknown,unknown,unknown,unknown>[] = [];
	#auth: AuthenticationAuthorizationSystem<User, Permissions>;
	#server: AutomatonServer;

	constructor(server: AutomatonServer, root: string, auth: AuthenticationAuthorizationSystem<User, Permissions>) {
		this.#server = server;
		this.#root = root;
		this.#auth = auth;
	}

	setDefaultAuth(auth: AuthenticationAuthorizationSystem<User, Permissions>){
		this.#auth = auth;
		return this;
	}

	// wraps the server function for easier chaining
	api(name: string){
		return this.#server.api(name);
	}

	start(port: number){
		return this.#server.start(port);
	}

	createClient(){
		let file = "";
		file+= ("\n\n\nclass ClientAPIClass extends AutomatonClient{");

		const functionnames = new Set();

		const methodVerbs: Record<string, string> = {
			"GET": "get",
			"PUT": "create",
			"POST": "post",
			"PATCH": "update",
			"DELETE": "delete"
		}

		let types = new Set();

		for(let h of [...this.#handlers].sort((a,b)=>a.pathString.localeCompare(b.pathString))){
			let name = h.pathString.substring(this.#root.length);
			
			// /wibble/{}/wobble
			name = name.split("/").filter(p=>p.charAt(0)!="$").map((p)=>p.charAt(0).toUpperCase()+p.substring(1)).join("");
			
			// camel-case -> CamelCase
			name = name.split("-").map((p)=>p.charAt(0).toUpperCase()+p.substring(1)).join("");

			let meta = <any>h.func ?? {};
			let functionName = meta.name ? meta.name : `${methodVerbs[h.method]}${name}`;

			let uname = functionName;
			let i = 1;
			while(functionnames.has(uname)){
				uname = functionName + ++i;
			}
			functionName = uname;
			functionnames.add(functionName);
			
			let typedArray = (v:VariableFactory[], opt=false)=>v.map(qv=>`${qv.name}${opt?"?":""}:${qv.type}`).join(", ")
			
			let pathParams = typedArray(h.pathVariables);
			let queryParams = h.queryVariables.length?`{${h.queryVariables.map(v=>v.name).join(", ")}}:{${typedArray(h.queryVariables, true)}}={}`:"";
			
			let bodyType = (h.method != "GET" && h.method != "HEAD")?`${meta.body ?? 'any'}`:"";
			if(bodyType != "any" && bodyType != ""){
				types.add(bodyType.split("[")[0])
			}
			let bodyParam = bodyType ? `body: ${bodyType}`:"";
			
			let returnType = meta.resp ?? "any";
			if(returnType == File){
				continue;
			}
			if(returnType != "any"){
				types.add(returnType.split("[")[0])
			}

			let p = bodyType==""?"":"//";
			let sendBody = "";

			if(h.body == BSONParse){
				p = "";
				sendBody = ", body: BSON.serialize(body)"
			}

			file+= (`
${p}	async ${functionName}(${[pathParams, bodyParam, queryParams].filter(v=>v).join(", ")}): Promise<${returnType}>{
${p}		let Øurl = \`${h.pathString}?\`;${h.queryVariables.map(v=>v.name).map(v=>`\n${p}\t\tØurl += ${v}!==undefined ? '${v}='+${v}+'&' : ''`)};
${p}		let Øresp = await fetch(Øurl, {method: "${h.method}"${sendBody}});
${p}		let Øjson = await Øresp.json();
${p}		return ${(h instanceof HandlerJ)?"Øjson.data ?? null":"Øjson"};
${p}	}
`);
		}
		file+=("}\n\n\n");
		file+=(`
const ClientAPI = new ClientAPIClass();
export default ClientAPI;
		`);

		file = `import { AutomatonClient, BSON } from "@automaton.systems/server/src/client/AutomatonClient.js";
import { ${[...types].sort().join(", ")} } from "./ClientTypes.js";` + file;

		return file;
	}

	async handle(method: string, path: string, request: http.IncomingMessage, responder: Responder<unknown>) {
		let req = new RequestWrapper(request);
		for (let handler of this.#handlers) {
			if (await handler.handle(method, path, req, responder))
				return true;
		}
		return responder.error('Endpoint not recognized', 404);
	}

    /**
     *
     * @param method
     * @param path
     * @param args
     *
     * @returns
     */
	endpoint<B, R>(method: string, path: string, body: BodyParser<B>, ...args: (EndpointOption<User, Permissions, B, R>[] | EndpointOptionJ<User, Permissions, B, R>[])): ServerApiEndpoint<User, Permissions> {
		let auth = this.#auth;
		let callback: any;//HandlerCallback<User, Permissions, B, R>;
		let params : string[] = [];
		let metas: Meta[] = [];
		let HandlerClass = Handler;
		for (let arg of args) {
			if(arg == STANDARD_JSON){
				HandlerClass = <any> HandlerJ;
			}if(arg instanceof Meta){
				metas.push(arg);
			}else if (typeof arg == 'function') {
				callback = arg;
			}else if (Array.isArray(arg)) {
				params = arg;
			}else if (typeof arg == 'object') {
				auth = arg;
			}
		}
		// apply metadata
		for(let meta of metas){
			meta.apply(callback);
		}
		// create the path
		if(path==null){
			path = '/';
		}
		if(path.startsWith('/')){
			path = path.substring(1);
		}
		path = this.#root + path;
		// actually register the handler
		let handler = new HandlerClass<User, Permissions, B,R>(this.#server, path, method, body, auth, params, callback);
		this.#handlers.push(handler);
		return this;
	}

	get<R>(path: string, ...args: BodylessEndpointOption<User, Permissions, R>[]) {
		return this.endpoint("GET", path, Body.NONE, ...args);
	}

	getj<R>(path: string, ...args: BodylessEndpointOptionJ<User, Permissions, R>[]) {
		return this.endpoint("GET", path, Body.NONE, STANDARD_JSON, ...args);
	}

	head<R>(path: string, ...args: BodylessEndpointOption<User, Permissions, R>[]) {
		return this.endpoint("HEAD", path, Body.NONE, ...args);
	}

	headj<R>(path: string, ...args: BodylessEndpointOptionJ<User, Permissions, R>[]) {
		return this.endpoint("HEAD", path, Body.NONE, STANDARD_JSON, ...args);
	}

	post<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOption<User, Permissions, B, R>[]) {
		return this.endpoint("POST", path, body, ...args);
	}

	postj<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOptionJ<User, Permissions, B, R>[]) {
		return this.endpoint("POST", path, body, STANDARD_JSON, ...args);
	}

	delete<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOption<User, Permissions, B, R>[]) {
		return this.endpoint("DELETE", path, body, ...args);
	}

	deletej<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOptionJ<User, Permissions, B, R>[]) {
		return this.endpoint("DELETE", path, body, STANDARD_JSON, ...args);
	}

	put<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOption<User, Permissions, B, R>[]) {
		return this.endpoint("PUT", path,  body, ...args);
	}

	putj<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOptionJ<User, Permissions, B, R>[]) {
		return this.endpoint("PUT", path,  body, STANDARD_JSON, ...args);
	}

	patch<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOption<User, Permissions, B, R>[]) {
		return this.endpoint("PATCH", path,  body, ...args);
	}

	patchj<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOptionJ<User, Permissions, B, R>[]) {
		return this.endpoint("PATCH", path,  body, STANDARD_JSON, ...args);
	}

	proxy(path: string, targetRoot: string|((reply: Responder<unknown>)=>string|Promise<string>)){
		return this.endpoint("*", path, Body.NONE, async (reply: Responder<unknown>)=>{
			let root = (typeof targetRoot == "function")?await targetRoot(reply):targetRoot;
			let targetUrl = new URL(root + reply.request.url.substring(path.length));
			proxyRequest(reply.request, reply.response, targetUrl);
			return true;
		});
	}
}

function proxyRequest(req: http.IncomingMessage, res: http.ServerResponse, target: URL) {
	req.pipe(
		http.request({
			hostname: target.hostname,
			port: target.port || (target.protocol === "https:" ? 443 : 80),
			path: target.pathname + target.search,
			method: req.method,
			headers: req.headers,
		}, (proxyRes) => {
			res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
			proxyRes.pipe(res);
		}).on("error", (err) => {
			console.error("Proxy request error:", err);
			res.writeHead(500);
			res.end("Internal Server Error");
		})
	);
}