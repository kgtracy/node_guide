const request = require('request');
var auth = null;

//Fetch the auth token and see if it is still good
exports.getToken = function () {
	console.log('Getting token'); 
	return new Promise(function(resolve,reject) {
		let time = null;
		
		//Check if our token has expired
		if (auth) {
			time = +Math.abs((auth.created-Date.now())/1000);
		}
		
		//If the token doesn't exist or has expired, create a new one; otherwise return the existing token
		if (!auth||time>=auth.expires_in){
			createToken().then(function(token){
				auth = token;
				resolve(auth);
			}).catch(function(err){
				console.log("Failed to create token!");
			});;
		} else {
			resolve(auth);
		}
	});
}

//Create a token from the API
function createToken() {
	console.log('Creating token'); 
	return new Promise(function(resolve,reject) {
		let tokenOptions = {
			method: 'GET',
			headers: {
				'authorization': 'Basic base64'
			},
			url: 'http://localhost:3000/token'
		};
		request(tokenOptions, function (error, res, body) {
			if (!error && res.statusCode == 200) {
				let token = JSON.parse(body);
				token.created = Date.now();
				console.log('Created token:'+token.access_token);
				resolve(token);
			} else {
				console.log('Failed to get token!'); 
				console.log('Response:'+JSON.stringify(res)); 
				reject(res);
			}
		});
	});
}