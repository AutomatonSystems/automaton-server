import Handler, { HandlerCallback } from "./Handler.js";
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import Responder from "../Responder.js";

import RequestWrapper from './RequestWrapper.js';
import http from 'http';
import AutomatonServer from "../AutomatonServer.js";

type EndpointOption = (AuthenticationAuthorizationSystem|string|string[]|HandlerCallback);
type BodylessEndpointOption = (AuthenticationAuthorizationSystem|string[]|HandlerCallback);

/**
  * 
  */
export default class ServerApiEndpoint {
	#root: string;
	#handlers: Handler[] = [];
	#auth: AuthenticationAuthorizationSystem;
	#server: AutomatonServer;

	constructor(server: AutomatonServer, root: string, auth: AuthenticationAuthorizationSystem) {
		this.#server = server;
		this.#root = root;
		this.#auth = auth;
	}

	setDefaultAuth(auth: AuthenticationAuthorizationSystem){
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

	async handle(method: string, path: string, request: http.IncomingMessage, responder: Responder) {
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
	endpoint(method: string, path: string, ...args: EndpointOption[]): ServerApiEndpoint {
		let auth = this.#auth;
		let callback: HandlerCallback;
		let body = null;
		let params : string[] = [];
		for (let arg of args) {
			if (typeof arg == 'function') {
				callback = arg;
			}else if (typeof arg == "string") {
				body = arg;
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
		this.#handlers.push(new Handler(path, method, body, auth, params, callback));
		return this;
	}

	get(path: string, ...args: BodylessEndpointOption[]) {
		return this.endpoint("GET", path, ...args);
	}

	post(path: string, ...args: EndpointOption[]) {
		return this.endpoint("POST", path, ...args);
	}

	delete(path: string, ...args: EndpointOption[]) {
		return this.endpoint("DELETE", path, ...args);
	}

	head(path: string, ...args: BodylessEndpointOption[]) {
		return this.endpoint("HEAD", path, ...args);
	}

	put(path: string, ...args: EndpointOption[]) {
		return this.endpoint("PUT", path, ...args);
	}

	patch(path: string, ...args: EndpointOption[]) {
		return this.endpoint("PATCH", path, ...args);
	}
}
