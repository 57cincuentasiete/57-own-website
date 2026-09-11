import { fsrs, createEmptyCard } from './vendor/dist/index.mjs';
export const model = fsrs({ request_retention: .9, enable_fuzz: false, enable_short_term: true, learning_steps: [], relearning_steps: [] });
export const initial = () => ({version:1, settings:{maximum:40,newMaximum:8,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone},cards:{},days:{},events:[]});
export function dayKey(now, zone) { return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function usage(s, now) { const key=dayKey(now,s.settings.timezone); return s.days[key] ??= {admitted:[],newIds:[],attempts:{},pending:null,served:0}; }
export function dueCards(s,now) { return Object.entries(s.cards).filter(([,c])=>new Date(c.due)<=now); }
export function next(s, words, now=new Date()) {
 const u=usage(s,now), max=s.settings.maximum;
 if(!max) return null;
 if(u.pending && (u.attempts[u.pending.id]||0)<2) return u.pending;
 const due=dueCards(s,now).filter(([id])=>(u.attempts[id]||0)<2);
 let chosen=due.filter(([id])=>u.admitted.includes(id)).sort((a,b)=>new Date(a[1].due)-new Date(b[1].due))[0];
 if(!chosen && u.admitted.length<max) {
  const pool=due.filter(([id])=>!u.admitted.includes(id));
  pool.sort((a,b)=>new Date(a[1].due)-new Date(b[1].due)||a[0].localeCompare(b[0]));
  if(u.served%5!==0) pool.sort((a,b)=>Number(model.get_retrievability(a[1],now,false))-Number(model.get_retrievability(b[1],now,false))||new Date(a[1].due)-new Date(b[1].due)||a[0].localeCompare(b[0]));
  chosen=pool[0];
  if(!chosen && !due.length && u.newIds.length<s.settings.newMaximum) { const word=words.find(w=>!s.cards[w.id]&&!u.admitted.includes(w.id)); if(word) {chosen=[word.id,null];u.newIds.push(word.id);} }
 }
 if(!chosen) return null;
 const id=chosen[0]; if(!u.admitted.includes(id))u.admitted.push(id);
 u.pending={id,token:crypto.randomUUID(),revealed:false}; return u.pending;
}
export function rate(s, token, grade, now=new Date()) {
 const u=usage(s,now),p=u.pending;
 if(!s.settings.maximum||!p||p.token!==token||!p.revealed||![1,2,3].includes(grade)||(u.attempts[p.id]||0)>=2)throw Error('This card changed. Please try again.');
 const before=s.cards[p.id]||createEmptyCard(now), result=model.next(before,now,grade);
 const count=(u.attempts[p.id]||0)+1;
 if(grade===1) {
  let due=new Date(now.getTime()+600000);
  if(count>=2) { due=new Date(now.getTime()+3600000); while(dayKey(due,s.settings.timezone)===dayKey(now,s.settings.timezone))due=new Date(due.getTime()+3600000); }
  result.card.due=due;
 }
 s.cards[p.id]=result.card;u.attempts[p.id]=count;u.served++;u.pending=null;
 s.events.push({id:token,wordId:p.id,at:now.toISOString(),grade,before,after:result.card,log:result.log,model:'ts-fsrs@5.4.2 / FSRS-6'});
 return result.card;
}
