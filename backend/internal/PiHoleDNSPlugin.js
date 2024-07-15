const axios   = require('axios');
const cheerio = require('cheerio');
const qs      = require('querystring');


const PIHOLE_PASSWORD      = process.env.PIHOLE_PASSWORD;
const PIHOLE_LOGIN_URL     = 'http://'+process.env.PIHOLE_IP+'/admin/index.php';
const PIHOLE_CUSTOMDNS_URL = 'http://'+process.env.PIHOLE_IP+'/admin/scripts/pi-hole/php/customdns.php';

// Function to update Pi-hole with domain and IP
async function updatePihole(domain, ip) {
	try {
		// Step 1: Login to Pi-hole to get session cookie
		const loginResponse = await axios.post(PIHOLE_LOGIN_URL, qs.stringify({
			pw: PIHOLE_PASSWORD,
		}), {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent':   'Mozilla/5.0'  // Pretend to be a browser
			},
			withCredentials: true  // Send cookies with the request
		});

		if (loginResponse.status === 200) {
			console.log('Login successful');
			// Extract session cookie (PHPSESSID)
			const cookies       = loginResponse.headers['set-cookie'];
			const sessionCookie = cookies.find((cookie) => cookie.startsWith('PHPSESSID'));

			if (!sessionCookie) {
				throw new Error('PHP session cookie not found');
			}

			// Step 2: Fetch HTML content of index.php after login
			const indexHtmlResponse = await axios.get(PIHOLE_LOGIN_URL, {
				headers: {
					Cookie: sessionCookie.split(';')[0]  // Send only the PHPSESSID part of the cookie
				}
			});

			// Load HTML content into cheerio for DOM manipulation
			const $ = cheerio.load(indexHtmlResponse.data);

			// Extract token value from element with ID "token"
			const token = $('#token').text().trim();

			console.log('Token retrieved:', token);

			// Step 3: Add custom DNS record with explicit session cookie and token
			const headers = {
				'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
				'Pragma':           'no-cache',
				'Accept':           'application/json, text/javascript, */*; q=0.01',
				'Accept-Language':  'en-GB,en;q=0.9',
				'Accept-Encoding':  'gzip, deflate',
				'Connection':       'keep-alive',
				'X-Requested-With': 'XMLHttpRequest',
				'Cookie':           sessionCookie.split(';')[0]  // Send only the PHPSESSID part of the cookie
			};

			// Request data including token
			const requestData = {
				action: 'add',
				ip:     ip,
				domain: domain,
				token:  token  // Use the token retrieved from the HTML page
			};

			// Make the POST request to add custom DNS record
			const addRecordResponse = await axios.post(PIHOLE_CUSTOMDNS_URL, qs.stringify(requestData), {
				headers: headers
			});

			console.log('Custom DNS record added:', addRecordResponse.data);
		} else {
			console.error('Login failed:', loginResponse.statusText);
		}
	} catch (error) {
		console.error('Error logging in or adding custom DNS record:', error.message);
	}
}

module.exports = {
	updatePihole: updatePihole
};
