"use strict";var n=require("fs"),a=require("path");(function(){let r=JSON.parse((0,n.readFileSync)(process.argv[2],"utf8")),c=process.argv[3],e=(0,a.join)(c,"npm"),o=[];try{let s=new Set(r.map(t=>t.name));for(let t of(0,n.readdirSync)(e)){let i=(0,a.join)(e,t);(0,n.lstatSync)(i).isDirectory()&&s.has(t)&&o.push(t)}}catch{}o.length&&console.warn(`OpenSSF malicious-packages (name match):
`+o.map(s=>`- ${s}`).join(`
`))})();
