//import { useEffect, useRef } from "react";

/**
 * 
 * 
 * @param type Element type eg div
 * @param props eg id="thing" onclick=()=>{}
 * @param children the tag body
 * @returns 
 */
export function LemonJelly(type: string, props: Record<string, any>, ...children: any): HTMLElement {
	let element = document.createElement(type);

	const renderCallbacks: (()=>void)[] = [];

	if(props){
		if(props.class){
			Object.assign(element, {className: props.class});
			delete props.class;
		}

		for(let [key, value] of Object.entries(props)){
			if(typeof value === "function"){
				(element as any)[key] = value();
				renderCallbacks.push(() => {
					(element as any)[key] = value();
				});
			}else{
				(element as any)[key] = value;
			}
		}

		// Object.assign(element, props);
	}


	for(let child of children){
		if (typeof child === "function") {
			const span = document.createElement("span");
			let result = child();
			if(result instanceof HTMLElement)
				span.appendChild(result);
			else
				span.innerText = result;
			element.append(span);
			renderCallbacks.push(() => {
				let result = child();
				if(result instanceof HTMLElement){
					span.innerHTML = "";
					span.appendChild(result);
				}else{
					span.innerText = result;
				}
			});
		} else if(child.then){
			let span = document.createElement("span");
			span.innerText = "...";
			element.append(span);
			child.then((result: any)=>{
				if(result instanceof HTMLElement){
					element.replaceChild(result, span);
				} else {
					span.innerText = result;
				}
			})
		}else if(child instanceof HTMLElement){
			if("render" in child)
				renderCallbacks.push(()=>(child as any).render());
			element.appendChild(child);
		}else{
			element.append(child);
		}
	}

	if(renderCallbacks.length > 0){
		(element as any).render = ()=>{
			renderCallbacks.forEach(f=>f());
		}
	}

	return element;
}

