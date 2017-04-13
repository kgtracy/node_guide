const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const port = 3000;
const expiration = 900000; //15 minutes

var tokens = {};
var users = [{'username':'testuser','surname':'McTestface','last_modified':Date.now()}];

//Delete any expired tokens based on the maximum time a token can exist
setInterval(function(){
	for (let i in tokens) {
		if (tokens[i].expires_in > Date.now()) {
			console.log('Token ' + i + ' has expired');
			delete tokens[i];
		}
	}
}, expiration);

//Listen for GET request to http://localhost:port/token
app.get('/token', function(req, res, next) {
	let auth = req.get('Authorization');
	if (auth === 'Basic base64'){
		//Create a token 
		let min = 100000;
		let max = 999999;
		let token = {
			'expires_in'  : Date.now() + expiration,
			'access_token' : Math.floor(Math.random() * (max - min + 1)) + min,
			'token_type' : 'Bearer'
		}
		//Add it to our list of outstanding tokens
		tokens[token.token_type+ ' ' +token.access_token] = token;
		console.log('Added token:' + token.token_type+ ' ' +token.access_token);

		//Give token to requestor
		res.status = 200;
		res.send(token);
	} else {
		res.status = 401;
		res.send({'error_message':'Unauthorized!'});
  }
});

//Listen for GET request to http://localhost:port/users
app.get('/users', function(req, res, next) {
	let token = req.get('Authorization');

	//If the token exists...
	if (tokens[token]){
		//If the token hasn't expired...
		if (tokens[token].expires_in > Date.now()){
			//... send the list of users
			res.status = 200;
			res.send(users);
		} else {
			res.status = 401;
			res.send({'error_message':'Unauthorized!'});
		}
	} else {
		res.status = 401;
		res.send({'error_message':'Unauthorized!'});
	}
});

//Listen for POST request to http://localhost:port/users
app.post('/users', function(req, res, next) {
  let token = req.get('Authorization');

  //If the token exists...
	if (tokens[token]){
		//If the token hasn't expired...
		if (tokens[token].expires_in > Date.now()){
			//If there is a value for username and surname...
			let input = req.body;
			let errMsg = 'Missing fields:';
			let err = 0;
			if (!input.username) {
				errMsg += ' username ';
				err = 1;
			}

			if (!input.surname) {
				errMsg += ' surname ';
				err = 1;
			}

			if (err) {
				res.status = 400;
				res.send(errMsg);	
			} else {
				//We don't want any other data, use only what we need
				let newUser = {
					'username': input.username,
					'surname': input.surname,
					'last_modified':Date.now()
				}
				users.push(newUser);
				console.log('Added User:' + JSON.stringify(newUser));
				res.status = 201;
				//...send the user we created back
				res.send(newUser);
			}
		} else {
			res.status = 401;
			res.send({'error_message':'Unauthorized!'});
		}
	} else {
		res.status = 401;
		res.send({'error_message':'Unauthorized!'});
	}
});

app.listen(port, function () {
	console.log('Listening on http://localhost:' + port);
});