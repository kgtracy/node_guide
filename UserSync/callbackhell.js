const ldap = require('ldapjs');
const request = require('request');

let usersDB = {};
let usersLDAP = {};

let tokenOptions = {
	method: 'GET',
	headers: {
		'authorization': 'Basic base64'
	},
	url: 'http://localhost:3000/token'
};

console.log('Get a token'); 
request(tokenOptions, function (error, res, body) {
	//Parse the response for our token
	let jsonBody = JSON.parse(body);
	console.log('Got token:'+jsonBody.access_token); 

	let userOptions = {
		method: 'GET',
		headers: {
			'Authorization':"Bearer " + jsonBody.access_token
		},
		url: 'http://localhost:3000/users'
	};

	console.log('Get existing DB users'); 
	request(userOptions, function (error, res, body) {
		let jsonBody = JSON.parse(body);

		//We know the response will be an array
		//Iterate through each user to find the username and last name
		for (let user of jsonBody){
			//Use the username as our key and surname as the value
			usersDB[user.username] = user.surname
		}
		console.log("Found: " + jsonBody.length + " users");

		console.log('Get existing LDAP users'); 
		let ldapURL  = "ldap://localhost:10389";
		let ldapBase = "dc=example,dc=com";
		let ldapUser = "CN=test_user,ou=users,ou=system";
		let ldapPw   = "Contoso1";
		
		console.log("Connecting to LDAP server");
		let client = ldap.createClient({
			url: ldapURL
		});
		console.log("Connected to " + ldapURL);

		console.log("Authenticating");
		client.bind(ldapUser,ldapPw,function(err,res) {
			if(err){
				console.log ('Error:' + err);
			} else {
				console.log("Authenticated as " + ldapUser);

				console.log("Searching");
				let ldapOptions = {
					filter: '(objectclass=person)',
					scope: 'sub'
				};
				
				client.search(ldapBase,ldapOptions,function(err,res) {		
					if(err){
						console.log ('Error:' + err);
					} else {		
						res.on('searchEntry', function(entry) {
							//Use the username as our key and surname as the value
							usersLDAP[entry.object.cn] = entry.object.sn;
						});
						res.on('error', function(err) {
							console.error('error: ' + err.message);
						});
						res.on('end', function(result) {
							console.log("LDAP Users: " + JSON.stringify(usersLDAP));
							console.log("DB Users: " + JSON.stringify(usersDB));

							console.log("Determining new users...");
							let count = 0;
							//Use usersLDAP as the source of truth
							Object.keys(usersLDAP).map(function(objectKey,index) {
								if (!usersDB[objectKey]) {
									console.log(objectKey + " exists only in LDAP");
									
									request(tokenOptions, function (error, res, body) {
										let jsonBody = JSON.parse(body);
										console.log('Got token:'+jsonBody.access_token); 

										let createUserOpt = {
											method: 'POST',
											headers: {
												'Authorization':'Bearer ' + jsonBody.access_token
											},
											json: { 
												'username': objectKey,
												'surname': usersLDAP[objectKey]
											},
											url: 'http://localhost:3000/users'
										};
										request(createUserOpt, function (error, res, body) {
											if (!error && res.statusCode == 200) {
												console.log("Added " + objectKey + " to DB");
												count++;
											} else {
												console.log('Error:'+error);
												console.log('Res:'+JSON.stringify(res));
											}
										});
									});
								}
							});
						});
					}
				});
			}
		});
	});
});