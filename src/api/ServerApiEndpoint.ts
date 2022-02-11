import Handler, { HandlerCallback } from "./Handler.js";
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import Responder from "../Responder.js";

import RequestWrapper, { Body, BodyType } from './RequestWrapper.js';
import http from 'http';
import AutomatonServer from "../AutomatonServer.js";

type EndpointOption<User, Permissions, X> = (AuthenticationAuthorizationSystem<User, Permissions>|string[]|HandlerCallback<User, Permissions, X>);
type BodylessEndpointOption<User, Permissions> = (AuthenticationAuthorizationSystem<User, Permissions>|string[]|HandlerCallback<User, Permissions, unknown>);

/**
  * 
  */
export default class ServerApiEndpoint<User, Permissions> {
	#root: string;
	#handlers: Handler<unknown,unknown,unknown>[] = [];
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
	endpoint<B extends Body>(method: string, path: string, body: B, ...args: EndpointOption<User, Permissions, BodyType<B>>[]): ServerApiEndpoint<User, Permissions> {
		let auth = this.#auth;
		let callback: HandlerCallback<User, Permissions, BodyType<B>>;
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
		this.#handlers.push(new Handler<User, Permissions, BodyType<B>>(this.#server, path, method, body, auth, params, callback));
		return this;
	}

	get(path: string, ...args: BodylessEndpointOption<User, Permissions>[]) {
		return this.endpoint("GET", path, Body.NONE, ...args);
	}

	head(path: string, ...args: BodylessEndpointOption<User, Permissions>[]) {
		return this.endpoint("HEAD", path, Body.NONE, ...args);
	}


	post<B extends Body>(path: string, body: B, ...args: EndpointOption<User, Permissions, BodyType<B>>[]) {
		return this.endpoint("POST", path, body, ...args);
	}

	delete<B extends Body>(path: string, body: B, ...args: EndpointOption<User, Permissions, BodyType<B>>[]) {
		return this.endpoint("DELETE", path,  body, ...args);
	}

	put<B extends Body>(path: string, body: B, ...args: EndpointOption<User, Permissions, BodyType<B>>[]) {
		return this.endpoint("PUT", path,  body, ...args);
	}

	patch<B extends Body>(path: string, body: B, ...args: EndpointOption<User, Permissions, BodyType<B>>[]) {
		return this.endpoint("PATCH", path,  body, ...args);
	}
}
