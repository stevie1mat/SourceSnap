import * as prettier from 'prettier/standalone';
import html from 'prettier/plugins/html';
import babel from 'prettier/plugins/babel';
import estree from 'prettier/plugins/estree';
import postcss from 'prettier/plugins/postcss';
export async function format(source:string,file:string):Promise<string>{
 const parser=file.endsWith('.html')?'html':file.endsWith('.css')?'css':file.endsWith('.js')?'babel':file.endsWith('.json')?'json':undefined;
 if(!parser)return source;
 try{return await prettier.format(source,{parser,plugins:[html,babel,estree,postcss]});}catch{return source;}
}
