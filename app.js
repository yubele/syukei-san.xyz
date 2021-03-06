'use strict'

const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const appRoot = require('app-root-path');
const cookieSession = require('cookie-session');
const valueScheme = require('value-schema');
const cookieParser = require('cookie-parser');
const fileSystem = require('fs');
const csrf = require('csurf');
const app = express();
const port = 3000;

// setup route middlewares
const csrfProtection = csrf({cookie: true});
const parseForm = bodyParser.urlencoded({extended: false});
const expressSanitizer = require('express-sanitizer');

require('dotenv').config();

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(cookieSession({
    name: 'syukei-san',
    keys: [process.env.SECRET, process.env.SECRET],
    maxAge: 30 * 60 * 1000,
    path: '/'
}));

// parse cookies
// we need this because "cookie" is true in csrfProtection
app.use(cookieParser(
    process.env.SECRET,
    {
        name: 'syukei-san',
        maxAge: 30 * 60 * 1000,
        path: '/'
    }));
// Mount express-sanitizer middleware here
app.use(expressSanitizer())

// express layout
const layout = require('express-layout');
app.use(layout());
app.set('layouts', './views/layouts');
app.set('layout', 'default');

const createErrorMessage = require('./libs/create_error_message.js');
const voteData = require('./libs/vote_data.js');
const validationSchemes = require('./libs/shemes');
const cleanData = require('./libs/clean_data.js');
const tagHelper = require('./helpers/tag_helper.js');
const formHelper = require('./helpers/form_helper.js');
const seo = require('./config/seo.js');

/**;
 * Health Check
 */
app.get('/active', function (req, res) {
    res.status(200);
    res.send('ok');
});

/**;
 * top page
 */
app.get('/', csrfProtection, function (req, res) {
    const cleanDataInstance = new cleanData()
    // unlink old files
    cleanDataInstance.clean(path.join(appRoot.path, 'data'));
    res.render('index', {
        hero: true,
        index: true,
        title: new seo(req).title(),
        description: new seo(req).description(),
        is_noindex: new seo(req).is_noindex(),
        csrfToken: req.csrfToken(),
        formHelper: new formHelper(req)
    });
});

/**;
 * Create syukei data
 */
app.post('/create', parseForm, csrfProtection, (req, res) => {
    // sanitize
    const voteDataInstance = new voteData();
    let sanitizedData = voteDataInstance.sanitizeData(req);
    // Validation
    let createErrorMessageInstance = new createErrorMessage('keyStack');
    valueScheme.fit(sanitizedData, validationSchemes.createVoteData, function (_error) {
        createErrorMessageInstance.add(_error);
    });
    // Log error message to session
    let errorMessages = createErrorMessageInstance.getMessages();
    if (errorMessages.length) {
        req.session.errorMessages = errorMessages;
        req.session.body = req.body;
        return res.redirect(req.baseUrl + '/#container');
    } else {
        req.session = null;
    }
    // Generate dirPath;
    let filePath = voteDataInstance.filePath();
    // Create Dirs
    fileSystem.mkdirSync(path.dirname(filePath), {recursive: true}, function (err) {
        // nothing
    });
    // Remove white space, Make data unique
    sanitizedData.data = sanitizedData.data
        .split(/\r?\n/).filter(v => v)
        .filter((elem, index, self) => self.indexOf(elem) === index);
    // add create_at
    sanitizedData.created_at =  Date.now();
    // Write to file
    fileSystem.writeFileSync(filePath, JSON.stringify(sanitizedData), function (err) {
        if (err) {
            throw err;
        }
    });
    return res.redirect(req.baseUrl + '/form/' + voteDataInstance.id + '/');
});

/**;
 * Voting Form
 */
app.get('/form/:id/', csrfProtection, function (req, res) {
    let voteDataInstance = new voteData(req.params.id);
    // Generate file path
    let filePath = voteDataInstance.filePath();
    // Voting data
    const form = JSON.parse(fileSystem.readFileSync(filePath, {encoding: "utf-8"}));
    res.render('form', {
        id: req.params.id,
        data: voteDataInstance.data().data,
        name: voteDataInstance.name(),
        title: new seo(req).title(),
        description: new seo(req).description(),
        is_noindex: new seo(req).is_noindex(),
        csrfToken: req.csrfToken(),
        isVoted: req.query.is_voted ? true : false
    });
});

/**;
 * Aggregate Result data
 */
app.post('/result/:id/', parseForm, csrfProtection, function (req, res) {
    let voteDataInstance = new voteData(req.params.id);
    // Uniqueness
    if (voteDataInstance.isVoted(req)) {
        return res.redirect(req.baseUrl + '/form/' + voteDataInstance.id + '/?is_voted=1');
    } else {
        // Set cookie to make one vote only
        voteDataInstance.setUniquenessCookie(req, res);
        // vote {req.body.key}
        voteDataInstance.vote(req.body.key);
    }
    res.render('result', {
        data: voteDataInstance.sortData(),
        name: voteDataInstance.name(),
        title: new seo(req).title(),
        description: new seo(req).description(),
        is_noindex: new seo(req).is_noindex(),
        tagHelper: new tagHelper()
    });
});

/**
 * View result data
 */
app.get('/result/:id/', function (req, res) {
    let voteDataInstance = new voteData(req.params.id);
    res.render('result', {
        data: voteDataInstance.sortData(),
        name: voteDataInstance.name(),
        title: new seo(req).title(),
        description: new seo(req).description(),
        is_noindex: new seo(req).is_noindex(),
        tagHelper: new tagHelper()
    });
});

/**;
 * Term
 */
app.get('/term', function (req, res) {
    res.render('term', {
        title: new seo(req).title(),
        description: new seo(req).description(),
        is_noindex: new seo(req).is_noindex()
    });
});

/**;
 * Landing Page
 */
app.get('/lp/', function (req, res) {
    res.render('landing/index', {
        title: new seo(req).title(),
        description: new seo(req).description(),
        is_noindex: new seo(req).is_noindex(),
        hero: true
    });
});
app.listen(port, () => console.log('listening on port 3000!'));