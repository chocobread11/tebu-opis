import './helpers/disable-telegram.mjs'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
const base='http://127.0.0.1:3064'
const child=spawn(process.execPath,['.output/server/index.mjs'],{env:{...process.env,NUXT_PUBLIC_DEMO:'false',NUXT_DATABASE_URL:'',NUXT_ADMIN_KEY:'',NITRO_HOST:'127.0.0.1',NITRO_PORT:'3064'},stdio:['ignore','pipe','pipe']})
let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x)
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await delay(100)}assert.ok(ready,output)
 for(const path of ['/','/drop','/admin','/admin/calendar','/admin/products','/admin/history','/admin/settings','/recover']){const response=await fetch(base+path);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-content-type-options'),'nosniff')}
 for(const [path,status] of [['/api/admin',401],['/api/admin/audit',401],['/api/admin/settings',401],['/api/orders',401],['/api/orders/not-valid',404],['/api/catalog',503]])assert.equal((await fetch(base+path)).status,status,path)
 assert.equal((await fetch(base+'/api/identity',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403)
 assert.equal((await fetch(base+'/api/admin')).headers.get('cache-control'),'no-store')
 console.log('PASS server: SSR routes, recovery/history pages, auth guards, missing-database guard, security/cache headers and cross-origin rejection.')
}finally{if(child.exitCode===null&&child.signalCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await ended}}
