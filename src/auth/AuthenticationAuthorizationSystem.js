
let id = 0;

/**
 * System that confirms:
 *  - the user is who they say they are (authentication)
 *  - the user access permissions (authorization)
 */
export default class AuthenticationAuthorizationSystem {

	static NONE = new (class extends AuthenticationAuthorizationSystem{
		async authentication(req){
			return {username: ""}
		}
	})();

	#id;

	constructor(){
		this.#id = id++;
	}

	get id(){
		return this.#id;
	}

	async perform(req){
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
     * @param {*} req
     * @returns {Promise<{username: String}| null>}
     */
	async authentication(req) {
		return null;
	}

    /**
     *
     * Returns the permissions for a user
     *
     * @param {String} username
	 * @returns {Promise<{}>}
     */
	async authorization(username) {
		return {};
	}
}

