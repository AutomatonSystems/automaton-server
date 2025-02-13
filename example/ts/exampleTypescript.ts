export function greet(): void{
	console.log("GREETINGS");

	throw(new Error("STACK TRACE!"));
}

export class Lemon{
	constructor(){
		
	}

	func(){
		console.log("hey hey");
	}
}