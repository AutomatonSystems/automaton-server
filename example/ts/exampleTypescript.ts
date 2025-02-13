export function greet(): void{
	console.log("GREETINGS");

	throw(new Error("STACK TRACE!"));
}