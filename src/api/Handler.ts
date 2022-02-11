
import Responder from '../Responder.js';
import RequestWrapper, { Body, BodyType } from './RequestWrapper.js';
import AuthenticationAuthorizationSystem from '../auth/AuthenticationAuthorizationSystem.js';
import { Server } from 'http';
import AutomatonServer, { StatusMode } from '../AutomatonServer.js';

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

export type HandlerCallback<User, Permission, X> = (res: Responder, args: ReplyArgs<User, Permission, X>) => Promise<any>;

export type ReplyArgs<User, Permissions, X> = {
	user: User
	permissions: Permissions
	body?: X

	// params
	[index: string]: any
}

export default class Handler<User, Permissions, X> {

	server: AutomatonServer;

	path: RegExp;

	pathVariables: VariableFactory[] = [];
	queryVariables: VariableFactory[] = [];

	body: Body;

	method: string;

	func: HandlerCallback<User, Permissions, X>;

	#auth: AuthenticationAuthorizationSystem<User, Permissions>;

	/**
	 * 
	 * @param path 
	 * @param method 
	 * @param body 
	 * @param auth 
	 * @param params 
	 * @param func 
	 */
	constructor(server: AutomatonServer, path: string, method: string, body: Body, auth: AuthenticationAuthorizationSystem<User, Permissions>, params: string[], func: HandlerCallback<User, Permissions, X>) {
		this.server = server;
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
	async handle(method: string, path: string, request: RequestWrapper<User, Permissions>, reply: Responder): Promise<Boolean> {
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
		let args = {} as ReplyArgs<User, Permissions, X>;
		parts.shift();
		for (let v of this.pathVariables)
			v.set(args, decodeURI(parts.shift()));

		// compute query params
		for (let v of this.queryVariables){
			let pvalue = request.param(v.name);
			if(typeof pvalue == "string")
				v.set(args, pvalue);
			else
				v.set(args, pvalue?.[0]);
		}

		// add permissions
		args['user'] = user.user;
		args['permissions'] = user.permissions;

		// grab the body if requested
		if (this.body) {
			args.body = <X><unknown> await request.readBody(this.body);
		}

		// and call the function
		try{
			return await this.func(reply, args);
		}catch(e){
			// the function failed. Error 500.
			console.warn(`Failed to handle ${method}:${path}`, e);
			let msg : any = {
				"status": "Internal Server Error"
			};
			if(this.server.config.statusMode == StatusMode.EXTENDED){
				msg.error = e.message;
				msg.trace = e.stack;
			}
			await reply.error(msg, 500);
		}
	}
}

