import test from 'node:test'
import assert from 'node:assert/strict'
import { shopSettingsInput, validSiteUrl } from '../shared/settings'
test('settings normalize contact numbers and website origins without accepting server credentials', () => {
  const value=shopSettingsInput().parse({ merchantName:' Shop Name ',supportWhatsapp:'012 345 6789',siteUrl:'https://tebu.example/',telegramEnabled:false,telegramChatId:'-100123',whatsappOpening:'Hi {name}!' })
  assert.equal(value.merchantName,'Shop Name');assert.equal(value.supportWhatsapp,'60123456789');assert.equal(value.siteUrl,'https://tebu.example')
  for(const field of ['adminKey','botToken','databaseUrl','uploadStorage','testingCalendar','telegramBotConfigured'])assert.equal(shopSettingsInput().safeParse({[field]:'secret'}).success,false)
  assert.equal(shopSettingsInput().safeParse({}).success,false)
})
test('website settings reject credentials, paths, query strings and public HTTP, and permit LAN development explicitly', () => {
  for(const url of ['javascript:alert(1)','http://public.example','https://user:password@tebu.example','https://tebu.example/path','https://tebu.example/?token=secret','https://tebu.example/#fragment'])assert.equal(validSiteUrl(url),false,url)
  assert.equal(validSiteUrl('http://192.168.1.2:3000',true),true)
  assert.equal(validSiteUrl('http://192.168.attacker.example',true),false)
  assert.equal(validSiteUrl(''),true)
})
test('blank optional settings clear values while invalid phone and chat IDs are rejected', () => {
  assert.equal(shopSettingsInput().safeParse({supportWhatsapp:'',siteUrl:'',telegramChatId:'',telegramEnabled:false}).success,true)
  for(const value of ['phone-number','1.5','0','+123','0123'])assert.equal(shopSettingsInput().safeParse({telegramChatId:value}).success,false)
  assert.equal(shopSettingsInput().safeParse({supportWhatsapp:'not-a-number'}).success,false)
  assert.equal(shopSettingsInput().safeParse({merchantName:''}).success,false)
})
