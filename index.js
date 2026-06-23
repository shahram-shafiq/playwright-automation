const fs = require('fs');
const nodemailer = require('nodemailer');
const { chromium } = require('playwright');
require('dotenv').config();

const data = fs.readFileSync('searches.txt', 'utf-8').trim();
const searches = data.split('\n').map(line => line.trim());

async function main() {
    const userDataDir = './browser-session';

    const browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        args: ['--disable-blink-features=AutomationControlled']
    });

    const page = await browser.newPage();
    const allLinks = {};

    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const acceptBtn = page.locator('button:has-text("Accept all")');
    if (await acceptBtn.isVisible().catch(() => false)) {
        await acceptBtn.click();
        await page.waitForTimeout(1000);
    }

    for (const search of searches) {
        console.log('\nSearching: ' + search);

        const searchBox = page.locator('textarea[name="q"]').first();
        await searchBox.click({ clickCount: 3 });
        await searchBox.fill('');
        await page.waitForTimeout(500);
        await searchBox.type(search, { delay: 80 });
        await page.waitForTimeout(800);
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);

        const links = await page.evaluate(() => {
            var found = [];
            var allAnchors = document.querySelectorAll('#search a');
            for (var i = 0; i < allAnchors.length; i++) {
                var href = allAnchors[i].href;
                if (
                    href &&
                    href.startsWith('http') &&
                    !href.includes('google') &&
                    !href.includes('#') &&
                    !found.includes(href)
                ) {
                    found.push(href);
                }
                if (found.length === 5) break;
            }
            return found;
        });

        allLinks[search] = links;
        console.log('Found ' + links.length + ' links for: ' + search);
        console.log(links);

        var cleanName = search.replace(/\s+/g, '');

        for (var i = 0; i < links.length; i++) {
            var url = links[i];
            var filename = 'screenshots/' + cleanName + (i + 1) + '.png';
            console.log('Taking screenshot: ' + filename);
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.waitForTimeout(1500);
                await page.screenshot({ path: filename });
                console.log('Saved: ' + filename);
            } catch (e) {
                console.log('Skipped: ' + url);
            }
        }

        await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
    }

    await browser.close();
    console.log('\nBrowser closed. Sending email...');
    await sendEmail(allLinks);
}

async function sendEmail(allLinks) {
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    var emailBody = '<h2>Playwright Automation - Task 2 Results</h2>';
    emailBody += '<p>Top 5 search results for each query with screenshots attached.</p>';

    for (var i = 0; i < searches.length; i++) {
        var search = searches[i];
        emailBody += '<h3>' + search + '</h3><ol>';
        var links = allLinks[search];
        for (var j = 0; j < links.length; j++) {
            emailBody += '<li><a href="' + links[j] + '">' + links[j] + '</a></li>';
        }
        emailBody += '</ol>';
    }

    var attachments = [];
    for (var i = 0; i < searches.length; i++) {
        var cleanName = searches[i].replace(/\s+/g, '');
        for (var j = 1; j <= 5; j++) {
            var filename = cleanName + j + '.png';
            var filepath = 'screenshots/' + filename;
            if (fs.existsSync(filepath)) {
                attachments.push({ filename: filename, path: filepath });
            }
        }
    }

    var mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO,
        subject: 'Task 2 - Search Results and Screenshots',
        html: emailBody,
        attachments: attachments
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully.');
}

main();