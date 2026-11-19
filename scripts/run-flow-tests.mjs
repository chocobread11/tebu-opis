import {spawn} from 'node:child_process'
const suites=['server','order-numbers','demo-smoke','image-loading','telegram-notifications','admin-session','settings','recovery-flows','products-inventory','box-capacity','checkout-access','customer-session','phone-receipt','profile-remarks','admin-transactions','product-split-migration','product-rename','deployment']
for(const suite of suites){
 console.log(`Running ${suite}`)
 const child=spawn(process.execPath,[...(suite==='deployment'?['--import','tsx']:[]),`tests/${suite}.mjs`],{stdio:'inherit',env:{...process.env,NUXT_TELEGRAM_BOT_TOKEN:'',NUXT_TELEGRAM_CHAT_ID:''}})
 const result=await new Promise(resolve=>child.once('exit',code=>resolve(code)))
 if(result!==0){process.exitCode=Number(result)||1;break}
}
