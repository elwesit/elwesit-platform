import sharp from 'sharp'; import fs from 'node:fs';
process.chdir(new URL("..", import.meta.url).pathname);
const svg = fs.readFileSync('public-static/icon.svg');
for (const [s, f] of [[180,'admin-ui/public/icon-180.png'],[192,'admin-ui/public/icon-192.png'],[512,'admin-ui/public/icon-512.png']]) await sharp(svg,{density:600}).resize(s,s).png().toFile(f);
const logo = await sharp(svg,{density:600}).resize(300,300).png().toBuffer();
await sharp({create:{width:1200,height:630,channels:3,background:'#f3e7cf'}}).composite([{input:logo,top:150,left:450}]).png().toFile('public-static/og.png');
console.log('ok');
