import {IncomingMessage} from 'http';

let id = 0;

/**
 * System that confirms:
 *  - the user is who they say they are (authentication)
 *  - the user access permissions (authorization)
 */
export default abstract class AuthenticationAuthorizationSystem<User, Permissions> {

	static NONE = new (class extends AuthenticationAuthorizationSystem<string, boolean>{
		override async authentication(req: IncomingMessage){
			return "";
		}

		override async authorization(username: string): Promise<boolean> {
			return true;
		}
	})();

	id: number;

	constructor(){
		this.id = id++;
	}

	/**
	 * 
	 * 
	 * 
	 * @param req the http request object this service is being asked to auth & auth
	 * @returns 
	 */
	async perform(req: IncomingMessage): Promise<{user: User, permissions: Permissions}>{
		let user = await this.authentication(req);
		if(user == null)
			return null;
		let permissions = await this.authorization(user);
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
	abstract authentication(req: IncomingMessage): Promise<User|null>;

    /**
     *
     * Returns the permissions for a user
     *
     */
	abstract authorization(user: User): Promise<Permissions>;
}

