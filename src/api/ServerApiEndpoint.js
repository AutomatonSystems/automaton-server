import Handler from "./Handler.js";
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import Responder from "../Responder.js";

import RequestWrapper from './RequestWrapper.js';
import http from 'http';


/**
 * 
 * @callback handlerCallback
 * @param {Responder} res 
 * @param {*} args
 */

/**
  * 
  */
export default class ServerApiEndpoint {
	#root;

    /**@type {Handler[]} */
	#handlers = [];

	/** @type {AuthenticationAuthorizationSystem} */
	#auth;

	constructor(root, auth) {
		this.#root = root;
		this.#auth = auth;
	}


	/**
	 * 
	 * @param {String} method 
	 * @param {String} path 
	 * @param {http.IncomingMessage} request 
	 * @param {Responder} responder 
	 */
	async handle(method, path, request, responder) {
		let req = new RequestWrapper(request);
		for (let handler of this.#handlers) {
			if (await handler.handle(method, path, req, responder))
				return true;
		}
		return responder.error('Endpoint not recognized', 404);
	}

    /**
     *
     * @param {String} method
     * @param {String} path
     * @param {...handlerCallback|AuthenticationAuthorizationSystem|String|String[]} args
     *
     * @returns {ServerApiEndpoint}
     */
	endpoint(method, path, ...args) {
		let auth = this.#auth;
		let func;
		let body = null;
		let params = [];
		for (let arg of args) {
			if (typeof arg == 'function') {
				func = arg;
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
		this.#handlers.push(new Handler(path, method, body, auth, params, func));
		return this;
	}

    /**
     *
     * Create a new API get endpoint
     *
     * @param {String} path
     * @param {...handlerCallback|AuthenticationAuthorizationSystem|String|String[]} args
     *
     * @returns {ServerApiEndpoint}
     */
	get(path, ...args) {
		return this.endpoint("GET", path, ...args);
	}

    /**
     *
     * create a new API post endpoint
     *
     * @param {String} path
     * @param {...handlerCallback|AuthenticationAuthorizationSystem|String|String[]} args
     *
     * @returns {ServerApiEndpoint}
     */
	post(path, ...args) {
		return this.endpoint("POST", path, ...args);
	}

    /**
     *
     * create a new API delete endpoint
     *
     * @param {String} path
     * @param {...handlerCallback|AuthenticationAuthorizationSystem|String|String[]} args
     *
     * @returns {ServerApiEndpoint}
     */
	delete(path, ...args) {
		return this.endpoint("DELETE", path, ...args);
	}
}
