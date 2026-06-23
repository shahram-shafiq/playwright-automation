const fs = require('fs');
const nodemailer = require('nodemailer');
const { chromium } = require('playwright');
require('dotenv').config();

const data = fs.readFileSync('searches.txt', 'utf-8').trim();
const searches = data.split('\n').map(line => line.trim());

async function main() {
    const browser = await chromium.launch({ headless: false });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();
    const allLinks = {};

    for (const search of searches) {
        console.log(`Searching: ${search}`);

        await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });

        const acceptBtn = page.locator('button:has-text("Accept all")');
        if (await acceptBtn.isVisible().catch(() => false)) {
            await acceptBtn.click();
            await page.waitForTimeout(1000);
        }

        await page.fill('textarea[name="q"], input[name="q"]', search);
        await page.keyboard.press('Enter');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        const links = await page.evaluate(() => {
            var found = [];
            var allLinks = document.querySelectorAll('#search a');
            for (var i = 0; i < allLinks.length; i++) {
                var href = allLinks[i].href;
                if (href && href.startsWith('http') && !href.includes('google') && !found.includes(href)) {
                    found.push(href);
                }
                if (found.length === 5) break;
            }
            return found;
        });

        allLinks[search] = links;
        console.log(`Found ${links.length} links for: ${search}`);
        console.log(links);

        await page.waitForTimeout(1500);
    }

    for (const search of searches) {
        const links = allLinks[search];
        const cleanName = search.replace(/\s+/g, '');

        for (let i = 0; i < links.length; i++) {
            const url = links[i];
            const filename = `screenshots/${cleanName}${i + 1}.png`;
            console.log(`Taking screenshot: ${filename}`);
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.waitForTimeout(1000);
                await page.screenshot({ path: filename, fullPage: true });
                console.log(`Saved: ${filename}`);
            } catch (e) {
                console.log(`Skipped (failed to load): ${url}`);
            }
        }
    }

    await browser.close();
    console.log('Browser closed. Sending email...');
    await sendEmail(allLinks);
}

async function sendEmail(allLinks) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    let emailBody = `<h2>Playwright Automation - Task 2 Results</h2>`;
    emailBody += `<p>Below are the top 5 search results for each query, along with screenshots attached.</p>`;

    for (const search of searches) {
        emailBody += `<h3>${search}</h3><ol>`;
        for (const link of allLinks[search]) {
            emailBody += `<li><a href="${link}">${link}</a></li>`;
        }
        emailBody += `</ol>`;
    }

    const attachments = [];
    for (const search of searches) {
        const cleanName = search.replace(/\s+/g, '');
        for (let i = 1; i <= 5; i++) {
            const filename = `${cleanName}${i}.png`;
            const filepath = `screenshots/${filename}`;
            if (fs.existsSync(filepath)) {
                attachments.push({ filename, path: filepath });
            }
        }
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO,
        subject: 'Task 2 - Search Results and Screenshots',
        html: emailBody,
        attachments
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully.');
}

main();