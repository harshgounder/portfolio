import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 0 } })
await server.listen()
const url = server.resolvedUrls.local[0] + '?scene=portfolio&t=2&dpr=1'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--no-first-run','--enable-unsafe-swiftshader','--use-angle=gl-egl'], defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR\n', e.stack))
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()))
await page.goto(url)
for (let i=0;i<6;i++){ await new Promise(r => setTimeout(r, 1500)); console.log('ready?', await page.evaluate(()=>window.__lab?.ready), 'frames', await page.evaluate(()=>window.__lab?.frames)) }
await browser.close(); await server.close()
