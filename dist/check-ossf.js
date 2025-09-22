"use strict";var n=require("fs"),t=require("path");(function(){let e=process.argv[2],i=process.argv[3];(0,n.existsSync)(e)||(console.error(`Error: changed.json file not found: ${e}`),process.exit(1));let a=JSON.parse((0,n.readFileSync)(e,"utf8")),c=(0,t.join)(i,"npm"),s=[];try{let r=new Set(a.map(o=>o.name));for(let o of(0,n.readdirSync)(c)){let m=(0,t.join)(c,o);(0,n.lstatSync)(m).isDirectory()&&r.has(o)&&s.push(o)}}catch{}s.length&&console.warn(`OpenSSF malicious-packages (name match):
`+s.map(r=>`- ${r}`).join(`
`))})();
