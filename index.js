const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');  
const app = express();
const puppeteer = require('puppeteer');
//const browsers = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browsers =  '/usr/bin/chromium';
const client = new Client({
    authStrategy: new LocalAuth(),
    clientId: 'client-id',
    puppeteer: {
        //executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        executablePath: browsers,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});
app.use(express.static('public'));
let qrCode = '';


// QR saat pertama kali login
//client.on('qr', qr => qrcode.generate(qr, { small: true })); ~~
client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        console.log(`QR RECEIVED`, qr); 
        qrCode = url; 
    });
    
    //qrcode.generate(qr, { small: true });
    console.log('QR Code generated, please scan it to authenticate');
}); 
  
client.on('ready', () =>
{
    qrCode = '';
    console.log('✅ Bot WhatsApp aktif!');
});

client.on('message', async msg =>
{
    const text = msg.body.trim();
    const chat = await msg.getChat();

    if (text.toLowerCase().startsWith('bpjs '))
    {
        const nik = text.split(' ')[1];
        if (!/^\d{16}$/.test(nik))
        {
            return chat.sendMessage('❌ Format salah. Contoh: *Bpjs 3206012010020007* (16 digit).');
        }

        await chat.sendStateTyping();
        await chat.sendMessage(`🔍 Sedang mencari data BPJS untuk NIK: *${nik}*...`);

        try
        {
            const data = await ambilDataBPJS(nik);
            await chat.sendMessage(
                `*Data Peserta BPJS:*\n` +
                `*Nama:* ${data.nama}\n` +
                `*No HP:* ${data.hp}\n` +
                `*Status:* ${data.status}\n` +
                `*Faskes:* ${data.faskes}\n` +
                `*Kelas:* ${data.kelas}\n` +
                `*Jenis Peserta:* ${data.jenisPeserta}`
            );

        } catch (err)
        {
            console.error('❌ Gagal ambil data:', err);
            await chat.sendMessage('⚠️ Gagal mengambil data. Pastikan koneksi atau data valid.');
        }
    }
});

// Fungsi untuk mengambil data dari ePuskesmas
async function ambilDataBPJS(nik)
{
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--ignore-certificate-errors'],
        executablePath: browsers,
        userDataDir: './user-data',
    });

    const page = await browser.newPage();

    try
    {
        await page.goto('https://tasik.epuskesmas.id/login#', { waitUntil: 'networkidle2' });

        if ((await page.title()).includes("Masuk"))
        {
            await page.waitForSelector('#email');
            await page.type('#email', 'rekamdatainformasi@gmail.com');
            await page.type('#password', 'RMIKcpt123%');
            await page.click('#login');
            await page.waitForNavigation({ waitUntil: 'networkidle0' });
        }

        // Skip jika redirect ke selectPuskesmas
        if (page.url().includes('selectpuskesmas'))
        {
            await page.goBack();
            await page.waitForNavigation({ waitUntil: 'networkidle0' });
        }

        await page.goto('https://tasik.epuskesmas.id/pasien/create', { waitUntil: 'networkidle0' });

        await page.select('select[name="MPasien[asuransi_id]"]', '0001'); // Pilih BPJS
        await page.waitForTimeout(1000);

        await page.waitForSelector('input[name="MPasien[no_asuransi]"]');
        await page.type('input[name="MPasien[no_asuransi]"]', nik);
        await page.click('#button_bridgingbpjs');
        await page.waitForTimeout(3000);

        const rawData = await page.$eval('#data_peserta_bpjs', el => el.innerText);
        const nomorHP = await page.$eval('input[name="MPasien[no_hp]"]', el => el.value || '-');

        const extract = (label) =>
        {
            const regex = new RegExp(label + '\\s*:\\s*(.+)', 'i');
            const match = rawData.match(regex);
            return match ? match[1].split('\n')[0].trim() : '-';
        };

        return {
            nama: extract('Nama Peserta'),
            status: extract('Status'),
            faskes: extract('Nama Provider'),
            kelas: extract('Kelas'),
            jenisPeserta: extract('Jenis Peserta'),
            hp: nomorHP
        };
    } finally
    {
        await browser.close();
    }
}


app.get('/', (req, res) => {
    res.send(`
      <html>
        <head>
          <title>WhatsApp Web</title>
          <script>
            setInterval(() => {
              fetch('/qr-code')
                .then(response => response.text())
                .then(qr => {
                  if (document.getElementById('qr-code').src !== qr) {
                    document.getElementById('qr-code').src = qr;
                  }
                });
            }, 1000);
          </script>
        </head>
        <body>
          <h1>WhatsApp Web</h1>
          <img id="qr-code" src="${qrCode}" />
        </body>
      </html>
    `);
  });
  app.get('/qr-code', (req, res) => {
    res.send(qrCode);
  });
  app.listen(4000, () => {
    console.log('Server started on port 3000'); 
  });
  
  
client.initialize();