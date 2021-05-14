
import Responder from '../Responder.js';
import RequestWrapper from './RequestWrapper.js';
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';

type VariableFactory = {
	name: string;
	set: (obj: any, value: string) => void;
};

/**
 * 
 * Turns a string like 'count:number'
 * into a function that parses and adds the property 'count' (of type number)
 * to a supplied object
 * 
 * @param input 
 * 
 * @returns
 */
function parseVariableFactory(input: string) : VariableFactory{
	let [name, type] = input.split(':');
	return {
		name: name,
		set: (obj: any, value: string) => {
			if (!value)
				return;
			let parsed = null;
			switch (type?.toLowerCase()) {
				case 'number':
					parsed = parseFloat(value);
					break;
				case 'boolean':
					parsed = (value.toLowerCase() == 'true');
					break;
				case 'json':
					parsed = JSON.parse(value);
					break;
				default:
					parsed = value;
					break;
			}
			obj[name] = parsed;
		}
	};
}

export type HandlerCallback = (res: Responder, args: any) => Promise<any>;

export default class Handler {

	path: RegExp;

	pathVariables: VariableFactory[] = [];
	queryVariables: VariableFactory[] = [];

	body: any;

	method: string;

	func: HandlerCallback;

	#auth: AuthenticationAuthorizationSystem;

	/**
	 * 
	 * @param path 
	 * @param method 
	 * @param body 
	 * @param auth 
	 * @param params 
	 * @param func 
	 */
	constructor(path: string, method: string, body: any, auth: AuthenticationAuthorizationSystem, params: string[], func: HandlerCallback) {
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
     * @param method
     * @param path
     * @param request
     * @param reply
     *
     * @returns
     */
	async handle(method: string, path: string, request: RequestWrapper, reply: Responder): Promise<Boolean> {
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
		let args = {} as any;
		parts.shift();
		for (let v of this.pathVariables)
			v.set(args, decodeURI(parts.shift()));

		// compute query params
		for (let v of this.queryVariables){
			let pvalue = request.param(v.name);
			if(typeof pvalue == "string")
				v.set(args, pvalue);
			else
				v.set(args, pvalue[0]);
		}

		// add permissions
		args['user'] = user.user;
		args['permissions'] = user.permissions;

		// grab the body if requested
		if (this.body) {
			args.body = await request.readBody(this.body);
		}

		// and call the function
		return await this.func(reply, args);
	}
}

