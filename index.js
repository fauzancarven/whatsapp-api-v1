const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');
//const browsers = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browsers =  '/usr/bin/chromium';
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        //executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        executablePath: browsers,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

// QR saat pertama kali login
client.on('qr', qr => qrcode.generate(qr, { small: true })); ~~

    client.on('ready', () =>
    {
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

client.initialize();
