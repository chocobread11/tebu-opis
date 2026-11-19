import './helpers/disable-telegram.mjs'
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {randomBytes,createHash} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import pg from 'pg'
const name=`tebu_admin_session_${Date.now()}`,url=new URL(process.env.NUXT_DATABASE_URL);url.pathname=`/${name}`
const root=new pg.Client({connectionString:process.env.NUXT_DATABASE_URL}),sql=new pg.Client({connectionString:url.toString()})
const key=randomBytes(32).toString('hex'),base='http://127.0.0.1:3068',digest=value=>createHash('sha256').update(value).digest('hex')
const env={...process.env,NUXT_DATABASE_URL:url.toString(),NUXT_ADMIN_KEY:key,NUXT_PUBLIC_DEMO:'false',NITRO_HOST:'127.0.0.1',NITRO_PORT:'3068'}
let server,created=false,output=''
async function call(path,{body,cookie,token,headers,...options}={}){
 const response=await fetch(base+path,{...options,method:options.method||(body?'POST':'GET'),headers:{'X-Forwarded-For':'127.0.0.99',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...headers},body:body?JSON.stringify(body):undefined})
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')||''}
}
const login=options=>call('/api/admin/session',{body:{},token:key,...options})
try{
 await root.connect();await root.query(`CREATE DATABASE "${name}"`);created=true
 const migration=spawnSync('bun',['prisma','migrate','deploy'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr)
 await sql.connect();server=spawn(process.execPath,['.output/server/index.mjs'],{env,stdio:['ignore','pipe','pipe']});server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b)
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await delay(100)}assert.ok(ready,output)
 assert.equal((await login({token:'wrong-key'})).status,401)
 assert.equal((await login({headers:{Origin:'https://untrusted.example'}})).status,403)
 const session=await login();assert.equal(session.status,200);assert.match(session.cookie,/HttpOnly/i);assert.match(session.cookie,/SameSite=Lax/i);assert.match(session.cookie,/Max-Age=43200/i)
 const cookie=session.cookie.split(';')[0],raw=cookie.split('=')[1]
 assert.ok(Math.abs(Date.parse(session.data.expiresAt)-Date.now()-12*60*60_000)<2000)
 assert.equal(session.data.token,undefined);assert.equal((await call('/api/admin',{cookie})).status,200)
 assert.equal((await call('/api/admin',{token:key})).status,200,'Existing API bearer keys remain supported')
 assert.equal((await call('/api/admin',{cookie})).cookie,'','Requests do not renew the session')
 const stored=(await sql.query('SELECT * FROM admin_sessions')).rows[0];assert.equal(stored.token_hash,digest(raw));assert.equal(stored.key_hash,digest(key));assert.equal(JSON.stringify(stored).includes(raw),false)
 assert.equal(stored.expires_at.toISOString(),session.data.expiresAt)
 assert.equal((await login({cookie,token:''})).status,401,'A session cannot extend itself without the key')
 assert.equal((await call('/api/admin',{cookie:'tebu_admin_session=invalid'})).status,401)
 assert.equal((await call('/api/admin',{cookie:`tebu_admin_session=${randomBytes(32).toString('base64url')}`})).status,401)
 const rotated=await login({cookie});assert.equal(rotated.status,200);assert.equal((await call('/api/admin',{cookie})).status,401,'New sign-in revokes the previous browser token')
 const rotatedCookie=rotated.cookie.split(';')[0]
 const logout=await call('/api/admin/session/logout',{cookie:rotatedCookie,body:{}});assert.equal(logout.status,200);assert.match(logout.cookie,/Max-Age=0/i);assert.equal((await call('/api/admin',{cookie:rotatedCookie})).status,401)
 const expired=await login();await sql.query("UPDATE admin_sessions SET expires_at=now()-interval '1 second'")
 const expiredResult=await call('/api/admin',{cookie:expired.cookie.split(';')[0]});assert.equal(expiredResult.status,401);assert.match(expiredResult.cookie,/Max-Age=0/i)
 const keyChanged=await login();await sql.query("UPDATE admin_sessions SET key_hash='previous-key'")
 assert.equal((await call('/api/admin',{cookie:keyChanged.cookie.split(';')[0]})).status,401,'Changing the configured key invalidates old sessions')
 const secure=await login({headers:{'X-Forwarded-Proto':'https'}});assert.match(secure.cookie,/; Secure/i)
 assert.equal((await call('/api/admin',{cookie:`tebu_customer_session=${raw}`})).status,401,'Customer cookies cannot authenticate admin')
 console.log('PASS admin sessions: 12-hour fixed expiry, HttpOnly/SameSite/Secure cookies, only hashes stored, no automatic renewal, malformed/expired/key-changed sessions rejected, token rotation, logout revocation, CSRF guard and bearer compatibility.')
}finally{
 if(server?.exitCode===null&&server?.signalCode===null){const end=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await end}
 await sql.end().catch(()=>{});if(created)await root.query(`DROP DATABASE "${name}" WITH (FORCE)`);await root.end()
}
