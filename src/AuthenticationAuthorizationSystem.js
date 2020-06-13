
let id = 0;
/**
 * System that confirms:
 *  - the user is who they say they are (authenticate)
 *  - the user access permissions (authorize)
 */
export class AuthenticationAuthorizationSystem {

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
		let permissions = this.authorization(user.username);
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

export class MicrosoftAuth extends AuthenticationAuthorizationSystem{
	async authentication(req){
		let bearerToken = req.headers.authorization;
		if(bearerToken == '' || bearerToken == null) {
			return null;
		}
		let resp = await fetch(
			'https://graph.microsoft.com/v1.0/me',
			{
				method: 'GET',
				headers: {
					Authorization: bearerToken
				}
			});

		let json = await resp.json();
		if(json==null || json.mail==null){
			return null;
		}
		return {
			username: json.mail
		};
	}
};

export const NO_AUTH = new (class extends AuthenticationAuthorizationSystem{
	async authentication(req){
		return {username: ""}
	}
})();
