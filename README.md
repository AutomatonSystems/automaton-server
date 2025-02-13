# automaton-server

[![https://nodei.co/npm/automaton-server.png?compact=true](https://nodei.co/npm/automaton-server.png?compact=true)](https://www.npmjs.com/package/automaton-server)

ZERO compile step combined webserver & API.

A simple combined file and API server for rapid webapp building.

Transparently serves typescript files via transpilation. Just import the .ts file with a .js extension instead!

## Usage

`npm install automaton-server`

### Basic Example
```javascript
import Server from 'automaton-server';

let server = new Server('test', Server.Auth.NO_AUTH);
server
	.serve('/','./public')
	.api('api')
		.get('item/{id:number}', async (reply, {id})=>{
			return await reply.json({id: id});
		});
server.start(80);
```

Creates a new server with no authentication on localhost (port 80).
* This server will serve the contents of the local directory `/public/` at http://localhost:80/ by default serving index.html at root
* HTTP GET Requests to http://localhost:80/api/item/17 will get the json response `{"id": 17}`, note the value 17 has been correctly parsed to a number

