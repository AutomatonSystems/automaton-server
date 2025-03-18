import { readFile } from "fs/promises";
import { FileModifier } from "../Responder";
import { join } from "path";
import { existsSync } from "fs";

export function NodeModuleImportRewriter(servePath: string): FileModifier{
	
	const nodeModulesCache: Record<string, string> = {};

	async function getNodeModulesPath(lib: string): Promise<string>{
		if(nodeModulesCache[lib] === undefined){
			try{
				let packageText = await readFile(`./node_modules/${lib}/package.json`, 'utf8');
				let json = JSON.parse(packageText);
				let truepath = join(servePath, '/', lib, json.main);
				truepath = truepath.replace(/\\/g, '/');
				nodeModulesCache[lib] = truepath;
			} catch (e){
				nodeModulesCache[lib] = null;
			}
		}
		return nodeModulesCache[lib];
	}

	async function resolveModuleImport(lib: string){
		if(lib.startsWith('#'))
			lib = lib.substring(1);
		let truepath = null;

		let moduleName = lib;

		// if we are tyring to import a js file from a ts file...
		if(moduleName.endsWith(".js")){
			if(!existsSync(`./node_modules/${moduleName}`)){
				let tsModuleFile = `${moduleName.substring(0,moduleName.length-2)}ts`;
				if(existsSync(`./node_modules/${tsModuleFile}`)){
					truepath = `${servePath}/${moduleName}`;
				}
			} else {
				truepath = `${servePath}/${moduleName}`;
			}
		}
		if(!truepath && !moduleName.endsWith(".js") && !moduleName.endsWith(".ts")){
			// resolve it to a node_module path
			truepath = await getNodeModulesPath(lib);
		}

		return truepath;
	}

	return async (srcpath: string, servepath: string, content: Buffer<ArrayBufferLike>)=>{
		if(!srcpath.endsWith(".js") && !srcpath.endsWith(".ts"))
			return content;
		let text = content.toString('utf8');
		// find imports that are from node_modules - IE import paths that don't start with . or / character
		
		// import something from "a-package";
		let matches = [...text.matchAll(/import ((.*) from )?["']([^.\/].*)['"];?/g)];
		let active = false;
		for(let pattern of matches){
			// grab the library name form out regexp
			let truepath = await resolveModuleImport(pattern[3]);
			// if we found it...
			if(truepath){
				text = text.replace(pattern[0], `import ${pattern[1]?pattern[1]:''}"${truepath}";`);
				active = true;
			}
		}

		// import "BLAH"
		matches = [...text.matchAll(/import\(["']([^.\/].*)['"]\)/g)];
		for(let pattern of matches){
			// grab the library name form out regexp
			let truepath = await resolveModuleImport(pattern[1]);
			// if we found it...
			if(truepath){
				text = text.replace(pattern[0], `import ("${truepath}")`);
				active = true;
			}
		}
		if(active){
			content = Buffer.from(text,'utf8');
		}
		return content;
	}
}