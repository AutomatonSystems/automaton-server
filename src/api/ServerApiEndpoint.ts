import Handler, { HandlerCallback, VariableFactory } from "./Handler.js";
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import Responder from "../Responder.js";

import RequestWrapper, { Body, BodyParser } from './RequestWrapper.js';
import http from 'http';
import AutomatonServer from "../AutomatonServer.js";

type EndpointOption<User, Permissions, X, R> = (AuthenticationAuthorizationSystem<User, Permissions>|string[]|HandlerCallback<User, Permissions, X, R>);
type BodylessEndpointOption<User, Permissions, R> = (AuthenticationAuthorizationSystem<User, Permissions>|string[]|HandlerCallback<User, Permissions, unknown, R>);

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
		console.log("\n\n\nexport class ClientAPI{");

		for(let h of this.#handlers){
			let name = h.pathString.substring(this.#root.length);
			if(name.indexOf('/') > 0){
				name = name.substring(0, name.indexOf('/'));
			}

			let meta = <any>h.func ?? {};

			let typedArray = (v:VariableFactory[], opt=false)=>v.map(qv=>`${qv.name}${opt?"?":""}:${qv.type}`).join(", ")
			let pathParams = typedArray(h.pathVariables);
			let body = (h.method != "GET" && h.method != "HEAD")?`body:${meta.body ?? 'any'}`:"";
			let queryParams = h.queryVariables.length?`{${h.queryVariables.map(v=>v.name).join(", ")}}:{${typedArray(h.queryVariables, true)}}={}`:"";
			let functionName = meta.name ? meta.name : `${h.method}${name}`;
			let returnType = meta.resp ?? "any";

			console.log(`
	async ${functionName}(${[pathParams, body, queryParams].filter(v=>v).join(", ")}): Promise<${returnType}>{
		let resp = await fetch(\`${h.pathString}\`, {method: "${h.method}"});
		let json = await resp.json();
		return json;
	}`)
		}
		console.log("}\n\n\n");
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
	endpoint<B, R>(method: string, path: string, body: BodyParser<B>, ...args: EndpointOption<User, Permissions, B, R>[]): ServerApiEndpoint<User, Permissions> {
		let auth = this.#auth;
		let callback: HandlerCallback<User, Permissions, B, R>;
		let params : string[] = [];
		for (let arg of args) {
			if (typeof arg == 'function') {
				callback = arg;
			}else if (Array.isArray(arg)) {
				params = arg;
			}else if (typeof arg == 'object') {
				auth = arg;
			}
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
		let handler = new Handler<User, Permissions, B,R>(this.#server, path, method, body, auth, params, callback);
		this.#handlers.push(handler);
		return this;
	}

	get<R>(path: string, ...args: BodylessEndpointOption<User, Permissions, R>[]) {
		return this.endpoint("GET", path, Body.NONE, ...args);
	}

	head<R>(path: string, ...args: BodylessEndpointOption<User, Permissions, R>[]) {
		return this.endpoint("HEAD", path, Body.NONE, ...args);
	}

	post<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOption<User, Permissions, B, R>[]) {
		return this.endpoint("POST", path, body, ...args);
	}

	delete<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOption<User, Permissions, B, R>[]) {
		return this.endpoint("DELETE", path,  body, ...args);
	}

	put<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOption<User, Permissions, B, R>[]) {
		return this.endpoint("PUT", path,  body, ...args);
	}

	patch<B, R>(path: string, body: BodyParser<B>, ...args: EndpointOption<User, Permissions, B, R>[]) {
		return this.endpoint("PATCH", path,  body, ...args);
	}

	proxy(path: string, targetRoot: string|((reply: Responder<unknown>)=>string|Promise<string>)){
		return this.endpoint("*", path, Body.NONE, async (reply: Responder<unknown>)=>{
			let root = (typeof targetRoot == "function")?await targetRoot(reply):targetRoot;
			let targetUrl = new URL(root + reply.request.url.substring("/api/ash/".length));
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