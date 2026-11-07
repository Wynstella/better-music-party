const fs=require('node:fs');
const path=require('node:path');
const [modules,destination]=process.argv.slice(2);
if(!modules||!destination)throw new Error('Usage: collect-licenses.cjs node_modules destination');
fs.mkdirSync(destination,{recursive:true});
const manifest=[];
function visit(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
    const folder=path.join(directory,entry.name);
    if(entry.name.startsWith('@')){visit(folder);continue;}
    const packageFile=path.join(folder,'package.json');
    if(!fs.existsSync(packageFile))continue;
    const info=JSON.parse(fs.readFileSync(packageFile,'utf8'));
    const key=`${info.name}@${info.version}`.replace(/[^A-Za-z0-9._-]/g,'_');
    const licenseFiles=fs.readdirSync(folder,{withFileTypes:true}).filter(file=>file.isFile()&&/^(licen[sc]e|copying|notice|third.?party)/i.test(file.name));
    for(const file of licenseFiles){
      fs.mkdirSync(path.join(destination,key),{recursive:true});
      fs.copyFileSync(path.join(folder,file.name),path.join(destination,key,file.name));
    }
    manifest.push({name:info.name,version:info.version,license:info.license??'See package documentation',homepage:info.homepage,files:licenseFiles.map(file=>`${key}/${file.name}`)});
    const nested=path.join(folder,'node_modules');if(fs.existsSync(nested))visit(nested);
  }
}
visit(modules);
fs.writeFileSync(path.join(destination,'packages.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Collected notices for ${manifest.length} frontend dependencies.`);
