import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--no-first-run','--enable-unsafe-swiftshader','--use-angle=gl-egl'] })
const p = await b.newPage()
await p.setJavaScriptEnabled(false)
await p.goto('https://harshgounder.github.io/portfolio/', { waitUntil: 'domcontentloaded' })
const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 260))
const links = await p.evaluate(() => document.querySelectorAll('a').length)
console.log(JSON.stringify({ text, links }))
await b.close()
