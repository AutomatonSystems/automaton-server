import {IncomingMessage} from 'http';

let id = 0;

/**
 * System that confirms:
 *  - the user is who they say they are (authentication)
 *  - the user access permissions (authorization)
 */
export default class AuthenticationAuthorizationSystem {

	static NONE = new (class extends AuthenticationAuthorizationSystem{
		override async authentication(req: IncomingMessage){
			return {username: ""}
		}
	})();

	#id: number;

	constructor(){
		this.#id = id++;
	}

	get id(){
		return this.#id;
	}

	/**
	 * 
	 * 
	 * 
	 * @param req the http request object this service is being asked to auth & auth
	 * @returns 
	 */
	async perform(req: IncomingMessage): Promise<{user: any, permissions: any}>{
		let user = await this.authentication(req);
		if(user == null)
			return null;
		let permissions = await this.authorization(user.username);
		if(permissions == null)
			return null;
		return {
			user: user,
			permissions: permissions
		}
	}

    /**
     *
     * Returns the authenticated user
     *
     */
	async authentication(req: IncomingMessage): Promise<{username: string}|null>{
		return null;
	}

    /**
     *
     * Returns the permissions for a user
     *
     */
	async authorization(username: string): Promise<any>{
		return {};
	}
}

