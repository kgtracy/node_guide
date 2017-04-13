# A Practical Introduction to Node.js

I have found Node to be incredibly useful when quickly developing interfaces or microservices. This guide is intended for developers with some experience in other languages who have already read the [Node.js about page](https://nodejs.org/en/about/) I am also assuming you have downloaded [Node.js and NPM](https://nodejs.org/en/download/)

There are a lot of other guides on how to use Node as a web service, so I won't go into detail about how the code for the API works. This guide focuses on how to use Node for more than just serving content.

## Problem:
The client has a system where new users are first created in Active Directory to manage permissions and authentication. An entry for that user is then created in a database to store information about that user for use with the client's web application. The number of new users is growing rapidly and the administators are now spending so much time creating new users that they cannot keep on top of their other duties.

To solve this problem we will be using Node and browsing existing libraries on npmjs.com to see if there is something that can help us.

## Initialization:
NPM is a popular dependency manager for Node, not unlike CPAN for Perl or Maven for Java. To start we will create a new folder for our project and a new package.json file which will be used by NPM to manage our dependencies.

```
{
  "name": "UserSync",
  "version": "0.0.1",
  "description": "Fetch people objects from an active directory server and update our DB via HTTP API",
  "main": "app.js",
  "author": "Keith Tracy",
  "dependencies": {    
  }
}
```

We need a way to query Active Directory and we also need to be able to send HTTP requests to the client's API. You can browse packages on npmjs.com or look for them in your favorite search engine. [request](https://www.npmjs.com/package/request) seems to be a popular package for HTTP calls and [LDAPjs](https://www.npmjs.com/package/ldapjs) seems to be popular for interacting with directories.

To download these packages, we will use the command line:
`npm install request --save` and `npm install ldapjs --save`

These must be executed in the folder containing our package.json file. If you are working on a large project and expect to use modules across multiple applications, you can use the `-g` flag to install them globally and the commands can be executed anywhere. You can use `npm list -g` to see which packages are available and `npm root -g` to see where they are installed.

Using the `--save` flag will cause npm to automatically write to our package.json file, so if you open it you should now see:

```
{
  "name": "UserSync",
  "version": "0.0.1",
  "description": "Fetch groups from an active directory server and update our DB via HTTP API",
  "main": "app.js",
  "author": "Keith Tracy",
  "dependencies": {    
	"ldapjs": "^1.0.1",
    "request": "^2.79.0"
  }
}
```

The symbols next to the version number control which versions NPM will download. This is important because sometimes a package may update and cause problems with your existing code. Needless to say, this can be very confusing to debug or very embarassing during a demonstration! But semantic versioning is outside the scope of this guide, for a full explanation [read the documentation]( https://docs.npmjs.com/misc/semver)


## The Application:
We will create a new file called app.js and import the packages with:

```javascript
const ldap = require('ldapjs');
const request = require('request');
```

The concept I am looking to implement starts with creating two lists: one by fetching the list of users from LDAP, the other by fetching the list of users from the database. We will then compare the two lists and if any exist in LDAP that do not exist in the DB, create them. So we should create a place to store these lists:

```javascript
const ldap = require('ldapjs');
const request = require('request');

let usersDB = {};
let usersLDAP = {};
```

## Callbacks:
One of the biggest features of Node is its asynchronous and event-driven nature. When we make an HTTP request Node will not wait around for the response, so we have to create a callback function which will handle the response.

Before we can query for the list of users, we must first authenticate ourselves with the API and get a token. The request object will take two arguments: the first being an object containing our HTTP request information, the second argument will be our callback function that is executed after we get a response. We know from reading the documentation that Request will return three arguments that we should handle.

```javascript
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
});
```

We know that our API will return a JSON object with a key called `access_token` that contains our token. The body will be a string, so need to parse it before we can use it.

```javascript
console.log('Get a token'); 
request(tokenOptions, function (error, res, body) {
	//Parse the response for our token
	let jsonBody = JSON.parse(body);
	console.log('Got token:'+jsonBody.access_token); 
});
```

We only get a token when we get a response from the API, so we may want to use our token to fetch the list of users in our callback function as well. We know it will return an array of objects, each one a unique user for our list.

```javascript
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
	});
});
```

## Events:
Events are an important feature of JavaScript and Node is built around them. Because of the asynchronous nature, events can be used to call listener functions when the event is emitted. From the documentation of LDAPjs, we know the ldap search function will return a variety of events. The ones we are interested in are: the `searchEntry` event for every search result and the `end` event that is emitted when all searchEntry events are finished.

Now that we have our list of users from the DB, lets get them from Active Directory via LDAPjs. We want to be able to compare our two lists after finding this list, so it makes sense to put this in the user request callback function.

```javascript
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
						//Calculate the difference between our two lists
						console.log("LDAP Users: " + JSON.stringify(usersLDAP));
						console.log("DB Users: " + JSON.stringify(usersLDAP));
					});
				}
			});
		}
	);
);
```		

We create another access token using the same options as before, then in the callback function we POST to the API to create our users one at a time since the API does not currently support creating new users in bulk. 

```javascript
res.on('end', function(result) {
	console.log("LDAP Users: " + JSON.stringify(usersLDAP));
	console.log("DB Users: " + JSON.stringify(usersDB));

	console.log("Determining new users...");
	let count = 0;
	//Use usersLDAP as the source of truth
	Object.keys(usersLDAP).map(function(objectKey,index) {
		if (!usersDB[objectKey]) {
			console.log(objectKey + " exists only in LDAP");
			
			//Our token might have expired, lets grab a new one
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
```

## Callback Hell:
Taking a step back and looking at this code we've written and you see we have callback functions nested inside callback functions nested inside even more callback functions. It has gotten to a point where the code has become unreadable and unmaintainable; this is known as callback hell. This code works and solves our client's problem, but anyone assigned to this project in the future will probably hate you. It also does not take advantage of the asynchronous nature of Node. We could also make this more efficient by storing our token, since our token doesn't expire after every use we end up making a lot of needless calls to the API creating new tokens.

```javascript
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
									
									//Our token might have expired, lets grab a new one
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
```

We can fix this problem a few different ways, such as using named functions for our callbacks or creating our own events. But there is another option...


## Promises:
Promises have been around for awhile as libraries, you may be familiar with Q promises or jQuery deffereds. But now the promises concept has been added to ES6 JavaScript, they help make our asynchronous code behave synchronously without becoming a mess. To put it simply, a promise is an agreement that a value may exist at some point in the future.

It has three states:
Pending:	We are waiting for the value
Fulfilled:	The value has been delivered
Rejected:	The value will never be delivered

Once a promise changes state from pending, it can never change state again. The rejected state should only be used for errors. The promises's state changes when you call the resolve or reject function.

Let us rewrite how we generate a token using promises:

```javascript
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
```

We want to avoid needless calls, so we should also create a function to only create one when we have to:

```javascript
let auth = null;
function getToken() {
	console.log('Getting token...'); 
	return new Promise(function(resolve,reject) {
		let time = null;
		
		//Check if our token has expired
		if (auth) {
			time = Math.abs((auth.created-Date.now())/1000);
		}
		
		//If the token doesn't exist or has expired, create a new one, otherwise return the existing token
		if (!auth||time>=auth.expires_in){
			createToken().then(function(token){
				auth = token;
				resolve(auth);
			});
		} else {
			resolve(auth);
		}
	});
}
```

Every promise will have a `.then` method that is called when a promise is resolved, and a `.catch` method that is called when a promise is rejected. These methods only take functions as an input, this is because the value that is resolved or rejected will be used as the input argument for that function.

After refactoring all of our code to use promises we end up with 5 nice and compact functions:

```javascript
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
```

We can then use these functions for our business logic like so:

```javascript
const ldap = require('ldapjs');
const request = require('request');

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
```

The Promise.all method allows us to wait for our promises to resolve before continuing. This means we can fetch our LDAP and DB groups at the same time and wait until we have both of our lists before trying to synchronize them with the database.  If a promise in the .all is rejected, the .all will also reject.

Our client informs us that they want this to run continuiously every thirty seconds after starting the program, so all together our code ends up looking like this:

```javascript
const ldap = require('ldapjs');
const request = require('request');
let timer = 30; //Seconds

console.log("Starting user synchronization");
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
		var token = null;
		let tokenOptions = {
			method: 'GET',
			headers: {
				'authorization': 'Basic base64'
			},
			url: 'http://localhost:3000/token'
		};
		request(tokenOptions, function (error, res, body) {
			if (!error && res.statusCode == 200) {
				var token = JSON.parse(body);
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
```

We have increased the lines of code, but more importantly we have improved the performance and maintainability.


## Modules:
While we have solved the client's problem, there is one further step we can take. It would be nice to be able to use our token functions in other projects that need to use the same API. We need to create a module. We cut our token code out and paste it in a new file called token.js:

```javascript
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
```

The exports object allows us to create public functions, our createToken function remains private to prevent developers from hitting the client's token API excessively.

Going back to our app.js file, we import our module like so:

```javascript
const token = require('./token.js');
```

Since it is currently in the same folder as our main application we have to use the ./ path syntax. If we place this file in our node_modules folder we could simply use:

```javascript
const token = require('token.js');
```

To use our new module, we simply need to call getToken(). But we should also change some of our variable names to avoid confusion:

```javascript
const token = require('token.js');

...

function getUsersDB() {
	console.log('Getting groups from DB'); 
	return new Promise(function(resolve,reject) {
		token.getToken().then(function(auth_token){
			let usersDB = {};
			let userOptions = {
				method: 'GET',
				headers: {
					'Authorization':"Bearer " + auth_token.access_token
				},
				url: 'http://localhost:3000/users'
			};
...

function syncUsers(values) {
	let count = 0;
	let usersDB = values[0];
	let usersLDAP = values[1];
	
	console.log("Determining new users...");
	return new Promise(function(resolve,reject) {
		token.getToken().then(function(auth_token){	
			//Use usersLDAP as the source of truth
			Object.keys(usersLDAP).map(function(objectKey,index) {
				if (!usersDB[objectKey]) {
					console.log(objectKey + " exists only in LDAP");
					
					let createUserOpt = {
						method: 'POST',
						headers: {
							'Authorization':'Bearer ' + auth_token.access_token
						},
						json: { 
							'username': objectKey,
							'surname': usersLDAP[objectKey]
						},
						url: 'http://localhost:3000/users'
					};
...
```		
			
## Conclusion:
This code can now be deployed and then started using `node app.js` on any platform capable of installing Node.js. When deploying to a new system, do not include the node_modules folder. This folder can get quite large as your dependencies also have dependencies! It is much faster to `npm install` once the code and package files have been deployed.


## Running the code yourself:
You will need a directory service in addition to the code provided. This guide was created with [Apache Directory Studio](http://directory.apache.org/studio/) in mind, but should suitably work for any LDAP compatible directory.

After installing Apache DS, you will want to go to the LDAP Browser and click the create LDAP Server button in the LDAP Servers tab. Then right-click on the server to start the server and create a connection. After the connection has been created, use the LDAP Browser again to expand Root DSE and then ou=system objects. Right click on ou=users and create a new entry from scratch as an inetOrgPerson object class. 

This user will be used to authenticate with the LDAP server. To have the code work without modification, you should select cn from the RDN dropdown and then set that as `test_user`, this is the username. Before clicking the finish button, we have to add an attribute for the user's password. Use the New Attribute button to create a new userPassword attribute. This will be the user's password, set that value to `Contoso1`.

Once the administrative user is created, we can create new users in a similar fashion by right clicking on dc=example,dc=com and creating a new entry from scratch. Add the person object class and then click next to add a username and surname.

Use `npm install` in the SyncAPI and UserSync folders. Then open a command prompt in SyncAPI and type `node server.js` to start the API. Then open a second command prompt in UserSync and type `node app.js` to start the application.


## Exercises:
Some people learn better by doing rather than reading alone. Try downloading different versions of the code and refactoring, here are some ideas:
 - Allow the API to accept an array of new users to create
 - Reformat the callback hell to use named callback functions instead of promises
 - Create person objects in LDAP if they only exist in the database
 - Have the syncUsers promise return the number of users created
 - Create a module to wrap the LDAP requests
 - Turn the string constants into environment variables


## Miscellaneous Tips:
- You can write your package file and put in dependencies manually, then use `npm install` to download them all at once. If you have already downloaded the module, you will have to delete it from the node_modules folder or use `npm update` to update its version.
 - If you encounter weird errors with dependencies, delete the node_modules folder then use `npm cache clean` and `npm install` to reinstall your modules.
 - let is preferable to var because it reduces the scope of the variable. Using var needlessly may create naming conflict headaches in large applications if you aren't careful.
 - With Promises it is not _necessary_ to call the reject function, however it is highly recommended for error handling! If you reject without a corresponding catch, you will get warnings.

