require('dotenv').config();
require('./worker'); 

const express = require('express');
const favicon = require('serve-favicon');
const path = require('path');

const app = express();

// public assets
app.use(express.static(path.join(__dirname, 'public')));
app.use(favicon(path.join(__dirname, 'public/images', 'favicon.ico')));
app.use('/coverage', express.static(path.join(__dirname, '..', 'coverage')));

// ejs for view templates
app.engine('.html', require('ejs').__express);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

// Middleware pour parser le JSON des requêtes POST
app.use(express.urlencoded({ extended: true })); // Pour parser les requêtes de formulaire
app.use(express.json());

// load route
require('./route')(app);

// server
const port = process.env.PORT || 3002;
app.server = app.listen(port);
console.log(`listening on port ${port}`);

require('./worker');

module.exports = app;
