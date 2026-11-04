import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--no-first-run','--enable-unsafe-swiftshader','--use-angle=gl-egl'], defaultViewport: { width: 1280, height: 800 } })
const p = await b.newPage()
p.on('pageerror', e => console.log('ERR', e.message))
for (const [name, y] of [['live-projects', 4920], ['live-lab', 6800], ['live-contact', 8440]]) {
  await p.goto('https://harshgounder.github.io/portfolio/?v=3', { waitUntil: 'networkidle2' })
  await p.evaluate(y => scrollTo(0, y), y)
  await new Promise(r => setTimeout(r, 2500))
  await p.screenshot({ path: `shots/${name}.png` })
  console.log('shot', name)
}
await b.close()
