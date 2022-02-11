import { IncomingMessage } from 'http';
import fetch from 'node-fetch';
import AuthenticationAuthorizationSystem from './AuthenticationAuthorizationSystem.js';

export default class MicrosoftAuth<Permissions> extends AuthenticationAuthorizationSystem<{username: string}, Permissions> {
	override async authentication(req: IncomingMessage) {
		let bearerToken = req.headers.authorization;
		if (bearerToken == '' || bearerToken == null) {
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
		if (json == null || json.mail == null) {
			return null;
		}
		return {
			username: json.mail
		};
	}

	override async authorization(user: { username: string; }): Promise<Permissions> {
		return <Permissions>{};
	}

}
