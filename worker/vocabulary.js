const enc = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const random = n => crypto.getRandomValues(new Uint8Array(n));
const b64 = bytes => {const data=new Uint8Array(bytes);let s='';for(let i=0;i<data.length;i+=8192)s+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(s)};
const unb64 = s => Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const reply = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const cookie = (token,age=604800) => `vocab_session=${token}; Path=/api/vocabulary; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function hash(s){return hex(await crypto.subtle.digest('SHA-256',enc.encode(s)))}
async function passwordKey(password,salt){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return b64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(salt),iterations:100000},key,256))}
async function keys(secret){const raw=unb64(secret);if(raw.length!==32)throw Error('Invalid key');return {aes:await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']),hmac:await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign'])}}
async function seal(key,value){const iv=random(12);return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(value))))}
async function open(key,value){const [iv,data]=value.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},key,unb64(data))))}
async function body(request){const reader=request.body?.getReader();if(!reader)throw Error('Missing body');let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();throw Error('Body too large')}chunks.push(value)}const bytes=new Uint8Array(size);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length}return JSON.parse(new TextDecoder().decode(bytes))}
export async function vocabularyApi(request,env){
 try {
  if(!env.VOCAB_DB||!env.VOCAB_ENCRYPTION_KEY)return reply({error:'Account service needs database and encryption-key setup.'},503);
  const url=new URL(request.url),action=url.pathname.slice('/api/vocabulary/'.length),db=env.VOCAB_DB;
  if(url.protocol!=='https:')return reply({error:'HTTPS is required.'},400);
  if(!['GET','POST','PUT'].includes(request.method))return reply({error:'Method not allowed'},405);
  if(request.method!=='GET'&&(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json')))return reply({error:'Invalid request origin or content type'},403);
  const key=await keys(env.VOCAB_ENCRYPTION_KEY);
  const lookup=async s=>hex(await crypto.subtle.sign('HMAC',key.hmac,enc.encode(s)));
  if(['register','login'].includes(action)&&request.method==='POST'){
   const bucket=await lookup('ip:'+ (request.headers.get('CF-Connecting-IP')||'local'));
   const now=Math.floor(Date.now()/1000);
   const limit=await db.prepare('INSERT INTO vocab_limits (id, count, expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count').bind(bucket,now+900,now,now).first();
   if(limit.count>20)return reply({error:'Too many attempts. Try again in 15 minutes.'},429);
   let input;try{input=await body(request)}catch{return reply({error:'Invalid request'},400)}
   const nickname=typeof input.nickname==='string'?input.nickname.normalize('NFKC').trim():'';
   if(nickname.length<2||nickname.length>40||/[\p{C}]/u.test(nickname)||typeof input.password!=='string'||input.password.length<12||input.password.length>128)return reply({error:'Use a 2–40 character nickname and a 12–128 character password.'},400);
   const id=await lookup('nickname:'+nickname.toLowerCase());
   let user=await db.prepare('SELECT * FROM vocab_users WHERE lookup=?').bind(id).first();
   if(action==='register'){
    const salt=b64(random(16)),verifier=await passwordKey(input.password,salt);
    const uid=crypto.randomUUID();
    const result=await db.prepare('INSERT OR IGNORE INTO vocab_users (id,lookup,credentials,progress,revision) VALUES (?,?,?,NULL,0)').bind(uid,id,await seal(key.aes,{nickname,salt,verifier})).run();
    if(!result.meta.changes)return reply({error:'Nickname unavailable. Choose another or log in.'},409);
    user={id:uid};
   }else{
    const credentials=user?await open(key.aes,user.credentials):{salt:b64(new Uint8Array(16)),verifier:b64(new Uint8Array(32))};
    const actual=unb64(await passwordKey(input.password,credentials.salt)),expected=unb64(credentials.verifier);let difference=0;for(let i=0;i<32;i++)difference|=actual[i]^expected[i];
    if(!user||difference)return reply({error:'Incorrect nickname or password.'},401);
   }
   const token=b64(random(32));await db.prepare('INSERT INTO vocab_sessions (token,user_id,expires) VALUES (?,?,?)').bind(await hash(token),user.id,now+604800).run();
   await db.prepare('DELETE FROM vocab_sessions WHERE expires<=?').bind(now).run();
   return reply({ok:true},200,{'Set-Cookie':cookie(token)});
  }
  const token=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('vocab_session='))?.slice(14);
  const session=token&&await db.prepare('SELECT user_id FROM vocab_sessions WHERE token=? AND expires>?').bind(await hash(token),Math.floor(Date.now()/1000)).first();
  if(!session)return reply({error:'Please log in.'},401);
  if(action==='logout'&&request.method==='POST'){await db.prepare('DELETE FROM vocab_sessions WHERE token=?').bind(await hash(token)).run();return reply({ok:true},200,{'Set-Cookie':cookie('',0)})}
  if(action==='progress'&&request.method==='GET'){
   const user=await db.prepare('SELECT * FROM vocab_users WHERE id=?').bind(session.user_id).first();
   return reply({accountId:user.id,nickname:(await open(key.aes,user.credentials)).nickname,state:user.progress?await open(key.aes,user.progress):null,revision:user.revision});
  }
  if(action==='progress'&&request.method==='PUT'){
   let input;try{input=await body(request)}catch{return reply({error:'Invalid or oversized progress'},400)}
   if(input.accountId!==session.user_id)return reply({error:'Account changed in another tab. Reload before continuing.'},409);
   if(!Number.isSafeInteger(input.revision)||!input.state||input.state.version!==1||!input.state.settings||!input.state.cards||!input.state.days||!Array.isArray(input.state.events))return reply({error:'Invalid progress'},400);
   const result=await db.prepare('UPDATE vocab_users SET progress=?,revision=revision+1 WHERE id=? AND revision=?').bind(await seal(key.aes,input.state),session.user_id,input.revision).run();
   return result.meta.changes?reply({revision:input.revision+1}):reply({error:'Progress changed in another tab. Reload before continuing.'},409);
  }
  return reply({error:'Not found'},404);
 }catch{return reply({error:'Account service unavailable. Please try again.'},503)}
}
