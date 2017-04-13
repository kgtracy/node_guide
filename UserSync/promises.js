const ldap = require('ldapjs');
const request = require('request');
let timer = 30; //Seconds

setInterval(function() {
	let usersDB = getUsersDB().catch(function (err) {
		console.log("Failed to get the user list from API!");
		console.log(err);
	});

	let usersLDAP = getUsersLDAP().catch(function (err) {
		console.log("Failed to get the user list from LDAP!");
		console.log(err);
	});

	Promise.all([usersDB,usersLDAP]).then(syncUsers).catch(function (err) {
		console.log("Failed to synchronize LDAP and DB!");
		console.log(err);
	});
}, timer * 1000); 

//Fetch the global auth token and see if it is still good
var auth = null;
function getToken() {
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

//Get users from the API
function getUsersDB() {
	console.log('Get existing DB users');
	return new Promise(function(resolve,reject) {
		getToken().then(function(token){
			let usersDB = {};
			let userOptions = {
				method: 'GET',
				headers: {
					'Authorization':"Bearer " + token.access_token
				},
				url: 'http://localhost:3000/users'
			};
			request(userOptions, function (error, res, body) {
				if (!error && res.statusCode == 200) {
					let jsonBody = JSON.parse(body);

					//We know the response will be an array
					//Iterate through each user to find the username and last name
					for (let user of jsonBody){
						//Use the username as our key and surname as the value
						usersDB[user.username] = user.surname
					}
					console.log("Found: " + jsonBody.length + " DB users");
					resolve(usersDB);
				} else {
					console.log("Failed to get users from the DB!");
					console.log('Response:'+res); 
					reject(res);
				}
			});
		}).catch(function(err){
			console.log("Failed to get token!");
		});
	});
}

//Get users from LDAP
function getUsersLDAP() {
	console.log('Get existing LDAP users');
	return new Promise(function(resolve,reject) { 
		let ldapURL  = "ldap://localhost:10389";
		let ldapBase = "dc=example,dc=com";
		let ldapUser = "CN=test_user,ou=users,ou=system";
		let ldapPw   = "Contoso1";
		let usersLDAP = {};
		
		console.log("Connecting to LDAP server");
		let client = ldap.createClient({
			url: ldapURL
		});
		console.log("Connected to " + ldapURL);

		console.log("Authenticating");
		client.bind(ldapUser,ldapPw,function(err,res) {
			if(err){
				console.log ('Failed to Authenticate:' + err);
				reject(err);
			} else {
				console.log("Authenticated as " + ldapUser);

				console.log("Searching");
				let ldapOptions = {
					filter: '(objectclass=person)',
					scope: 'sub'
				};
				
				client.search(ldapBase,ldapOptions,function(err,res) {		
					if(err){
						console.log ('Failed to Search:' + err);
						reject(err);
					} else {		
						res.on('searchEntry', function(entry) {
							//Use the username as our key and surname as the value
							usersLDAP[entry.object.cn] = entry.object.sn;
						});
						res.on('error', function(err) {
							console.error('Error while searching: ' + err.message);
							reject(err);
						});
						res.on('end', function(result) {
							console.log("Found: " + Object.keys(usersLDAP).length + " LDAP users");
							resolve(usersLDAP);
						});
					}
				});
			}
		});
	});
}

//Compares two lists and creates new users via the API
function syncUsers(values) {
	let count = 0;
	let usersDB = values[0];
	let usersLDAP = values[1];
	
	console.log("Determining new users...");
	return new Promise(function(resolve,reject) {
		getToken().then(function(token){	
			//Use usersLDAP as the source of truth
			Object.keys(usersLDAP).map(function(objectKey,index) {
				if (!usersDB[objectKey]) {
					console.log(objectKey + " exists only in LDAP");
					
					let createUserOpt = {
						method: 'POST',
						headers: {
							'Authorization':'Bearer ' + token.access_token
						},
						json: { 
							'username': objectKey,
							'surname': usersLDAP[objectKey]
						},
						url: 'http://localhost:3000/users'
					};
					count++;
					request(createUserOpt, function (error, res, body) {
						if (!error && res.statusCode == 200) {
							console.log("Added " + objectKey + " to DB");
						} else {
							console.log('Error:'+error);
							console.log('Res:'+JSON.stringify(res));
						}
					});
				} else {
					console.log(objectKey + " already exists");
				}
			});
			console.log("Finished comparing lists");
			//This function will probably resolve before we finish getting all the responses creating all the users, but that is okay since the request callback will still be called
			resolve(true);
		}).catch(function(err){
			console.log("Failed to get token!");
		});;
	});
}
