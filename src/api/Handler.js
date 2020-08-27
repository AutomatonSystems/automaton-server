
import Responder from '../Responder.js';
import RequestWrapper from './RequestWrapper.js';
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';

/**
 * 
 * Turns a string like 'count:number'
 * into a function that parses and adds the property 'count' (of type number)
 * to a supplied object
 * 
 * @param {String} input 
 * 
 * @returns {{name: String, set: Function}}}
 */
function parseVariableFactory(input) {
	let [name, type] = input.split(':');
	return {
		name: name,
		set: (obj, value) => {
			if (!value)
				return;
			switch (type) {
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
	};
}


/**
 * 
 * @callback handlerCallback
 * @param {Responder} res 
 * @param {*} args
 */

export default class Handler {

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

	/**
	 * 
	 * @param {String} path 
	 * @param {String} method 
	 * @param {String} body 
	 * @param {AuthenticationAuthorizationSystem} auth 
	 * @param {String[]} params 
	 * @param {handlerCallback} func 
	 */
	constructor(path, method, body, auth, params, func) {
		// extract path args
		while (path.includes('{')) {
			let variable = path.substring(path.indexOf('{'), path.indexOf('}') + 1);
			path = path.replace(variable, "([^/]+)");
			this.pathVariables.push(parseVariableFactory(variable.substring(1, variable.length - 1)));
		}
		// add query params
		this.queryVariables = params.map(parseVariableFactory);

		// read off how the request body should be used
		this.body = body;

		// auth system to 
		this.#auth = auth;

		this.path = new RegExp(path,'i');
		this.method = method;

		this.func = func;
	}

    /**
     * @param {String} method
     * @param {String} path
     * @param {RequestWrapper} request
     * @param {Responder} reply
     *
     * @returns {Promise<Boolean>}
     */
	async handle(method, path, request, reply) {
		if (this.method != method)
			return false;

		let parts = path.match(this.path);
		if (!parts)
			return false;

		// check AUTH
		let user = await request.getAuth(this.#auth);
		if (user == null)
			return await reply.error("Permission denied", 403);

		// compute vars
		let args = {};
		parts.shift();
		for (let v of this.pathVariables)
			v.set(args, decodeURI(parts.shift()));

		// compute query params
		for (let v of this.queryVariables)
			v.set(args, request.param(v.name));

		// add permissions
		args['permissions'] = user.permissions;

		// grab the body if requested
		if (this.body) {
			args.body = await request.readBody(this.body);
		}

		// and call the function
		return await this.func(reply, args);
	}
}
