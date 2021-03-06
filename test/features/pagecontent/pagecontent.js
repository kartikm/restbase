'use strict';

// mocha defines to avoid JSHint breakage
/* global describe, it, before, beforeEach, after, afterEach */

const assert = require('../../utils/assert.js');
const preq = require('preq');
const server = require('../../utils/server.js');
const P = require('bluebird');
const mwUtils = require('../../../lib/mwUtil');
let pagingToken = '';

describe('item requests', function() {
    this.timeout(20000);

    before(function () { return server.start(); });

    var contentTypes = server.config.conf.test.content_types;

    const assertCORS = (res) => {
        assert.deepEqual(res.headers['access-control-allow-origin'], '*');
        assert.deepEqual(res.headers['access-control-allow-methods'], 'GET,HEAD');
        assert.deepEqual(res.headers['access-control-allow-headers'], 'accept, content-type, content-length, cache-control, ' +
            'accept-language, api-user-agent, if-match, if-modified-since, if-none-match, dnt, accept-encoding');
        assert.deepEqual(res.headers['access-control-expose-headers'], 'etag');
        assert.deepEqual(res.headers['referrer-policy'], 'origin-when-cross-origin');
    };
    const createTest = (method) => {
        it(`should respond to ${method} request with CORS headers`, function() {
            return preq[method]({ uri: server.config.bucketURL + '/html/Foobar/624484477' })
            .then(function(res) {
                assert.deepEqual(res.status, 200);
                assertCORS(res);
            });
        });
    };
    createTest('options');
    createTest('get');
    it(`should respond to GET request with CORS headers, 404`, function() {
        return preq.get({ uri: server.config.bucketURL + '/html/This_page_is_likely_does_not_exist' })
        .catch(function(res) {
            assert.deepEqual(res.status, 404);
            assertCORS(res);
        });
    });

    it('should transparently create a new HTML revision for Main_Page', function() {
        return preq.get({
            uri: server.config.labsBucketURL + '/html/Main_Page',
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            return preq.get({
                uri: server.config.labsBucketURL + '/html/Main_Page/'
            });
        })
        .then(function(res) {
            if (res.body.items.length !== 1) {
                throw new Error('Expected a single revision for Main_Page');
            }
        });
    });
    it('should transparently create a new HTML revision with id 252937', function() {
        return preq.get({
            uri: server.config.labsBucketURL + '/html/Foobar/252937',
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
        });
    });

    it('should request page lints. no revision', () => {
        return preq.get({
            uri: `${server.config.bucketURL}/lint/User%3APchelolo%2FLintTest`
        })
        .then((res) => {
            assert.deepEqual(res.status, 200);
            assert.deepEqual(res.body.length > 0, true);
        })
    });

    it('should request page lints. with revision', () => {
        return preq.get({
            uri: `${server.config.bucketURL}/lint/User%3APchelolo%2FLintTest/830278619`
        })
        .then((res) => {
            assert.deepEqual(res.status, 200);
            assert.deepEqual(res.body.length > 0, true);
        })
    });

    var rev2Etag;
    it('should transparently create data-parsoid with id 241155, rev 2', function() {
        return preq.get({
            uri: server.config.labsBucketURL + '/html/Foobar/241155'
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            rev2Etag = res.headers.etag.replace(/^"(.*)"$/, '$1');
        });
    });

    it('should return HTML and data-parsoid just created by revision 241155', function() {
        return preq.get({
            uri: server.config.labsBucketURL + '/html/Foobar/241155'
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            assert.contentType(res, contentTypes.html);
            return preq.get({
                uri: server.config.labsBucketURL + '/data-parsoid/Foobar/'
                    + res.headers.etag.replace(/^"(.*)"$/, '$1')
            });
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            assert.contentType(res, contentTypes['data-parsoid']);
        });
    });

    it('should return data-parsoid just created with revision 252937, rev 2', function() {
        return preq.get({
            uri: server.config.labsBucketURL + '/data-parsoid/Foobar/' + rev2Etag
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            assert.contentType(res, contentTypes['data-parsoid']);
        });
    });

    it('should return sections of Main_Page, with revision', function () {
        return preq.get({
            uri: `${server.config.labsBucketURL}/html/Main_Page/262492`
        })
        .then(res => {
            const tid = mwUtils.parseETag(res.headers.etag).tid;
            return preq.get({
                uri: `${server.config.labsBucketURL}/data-parsoid/Main_Page/262492/${tid}`
            });
        })
        .then(res => {
            const ids = Object.keys(res.body.sectionOffsets).slice(0, 2);
            return preq.get({
                uri: server.config.labsBucketURL + '/html/Main_Page/262492',
                query: {
                    sections: ids.join(',')
                }
            })
            .then(function (res) {
                assert.deepEqual(res.status, 200);
                assert.contentType(res, 'application/json');
                assert.deepEqual(res.headers['cache-control'], 'no-cache');
                const body = res.body;
                ids.forEach(id => {
                    if (!body[id] || typeof body[id] !== 'string') {
                        throw new Error(`Missing section content for id ${id}!`);
                    }
                });
            });
        });
    });

   it('should return sections of Main_Page, no revision', function () {
        return preq.get({
            uri: `${server.config.labsBucketURL}/html/Main_Page`
        })
        .then(res => {
            const tid = mwUtils.parseETag(res.headers.etag).tid;
            const rev = mwUtils.parseETag(res.headers.etag).rev;
            return preq.get({
                uri: `${server.config.labsBucketURL}/data-parsoid/Main_Page/${rev}/${tid}`
            });
        })
        .then(res => {
            const ids = Object.keys(res.body.sectionOffsets).slice(0, 2);
            return preq.get({
                uri: server.config.labsBucketURL + '/html/Main_Page',
                query: {
                    sections: ids.join(',')
                }
            })
            .then(function (res) {
                assert.deepEqual(res.status, 200);
                assert.contentType(res, 'application/json');
                assert.deepEqual(res.headers['cache-control'], 'no-cache');
                const body = res.body;
                ids.forEach(id => {
                    if (!body[id] || typeof body[id] !== 'string') {
                        throw new Error(`Missing section content for id ${id}!`);
                    }
                });
            });
        });
    });

    it('should get sections of Main_Page with no-cache and unchanged render', function() {
        return preq.get({
            uri: `${server.config.labsBucketURL}/html/Main_Page`
        })
        .then(res => {
            const tid = mwUtils.parseETag(res.headers.etag).tid;
            const rev = mwUtils.parseETag(res.headers.etag).rev;
            return preq.get({
                uri: `${server.config.labsBucketURL}/data-parsoid/Main_Page/${rev}/${tid}`
            });
        })
        .then(res => {
            const ids = Object.keys(res.body.sectionOffsets).slice(0, 2);
            return preq.get({
                uri: server.config.labsBucketURL + '/html/Main_Page',
                query: {
                    sections: ids.join(',')
                },
                headers: {
                    'cache-control': 'no-cache'
                }
            })
            .then(function (res) {
                assert.deepEqual(res.status, 200);
                assert.contentType(res, 'application/json');
                assert.deepEqual(res.headers['cache-control'], 'no-cache');
                const body = res.body;
                ids.forEach(id => {
                    if (!body[id] || typeof body[id] !== 'string') {
                        throw new Error(`Missing section content for id ${id}!`);
                    }
                });
            });
        });
    });

    it('section retrieval: error handling', function() {
        return preq.get({
            uri: server.config.labsBucketURL + '/html/Main_Page/262492',
            query: {
                sections: 'somethingThatDoesNotExist'
            },
        })
        .then(function(res) {
            throw new Error('Request should return status 400');
        }, function(res) {
            assert.deepEqual(res.status, 400);
        });
    });

    it('should list APIs using the generic listing handler', function() {
        return preq.get({
            uri: server.config.hostPort + '/en.wikipedia.org/'
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            assert.contentType(res, 'application/json');
            assert.deepEqual(res.body, {
                items: ['v1' ]
            });
        });
    });

    it('should retrieve the spec', function() {
        return preq.get({
            uri: server.config.baseURL + '/?spec'
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            assert.contentType(res, 'application/json');
            assert.deepEqual(res.body.swagger, '2.0');
        });
    });

    it('should retrieve the swagger-ui main page', function() {
        return preq.get({
            uri: server.config.baseURL + '/',
            headers: { accept: 'text/html' }
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            assert.contentType(res, 'text/html');
            assert.deepEqual(/<html/.exec(res.body)[0], '<html');
        });
    });

    it('should retrieve all dependencies of the swagger-ui main page', function() {
        return preq.get({ uri: server.config.baseURL + '/?doc' })
        .then(function(res) {
            var assertions = [];
            var linkRegex = /<link\s[^>]*href=["']([^"']+)["']/g;
            var scriptRegex =  /<script\s[^>]*src=["']([^"']+)["']/g;
            var match;
            while (match = linkRegex.exec(res.body)) {
                assertions.push(match[1]);
            }
            while (match = scriptRegex.exec(res.body)) {
                assertions.push(match[1]);
            }
            return P.all(assertions.map(function(path) {
                return preq.get({ uri: server.config.baseURL + '/' + path })
                .then(function(res) {
                    assert.deepEqual(res.status, 200);
                });
            }));
        });
    });

    it('should retrieve domain listing in html', function() {
        return preq.get({
            uri: server.config.hostPort + '/',
            headers: {
                accept: 'text/html'
            }
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            assert.contentType(res, 'text/html');
            assert.deepEqual(/<html/.exec(res.body)[0], '<html');
        });
    });

    it('should list page titles', function() {
        return preq.get({
            uri: server.config.bucketURL + '/title/'
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            assert.contentType(res, 'application/json');
            if (!res.body.items || !res.body.items.length) {
                throw new Error("Empty listing result!");
            }
            if (!/^!/.test(res.body.items[0])) {
                throw new Error("Expected the first titles to start with !");
            }
            pagingToken = res.body._links.next.href;
       });
    });


    it('should list another set of page titles using pagination', function() {
        return preq.get({
            uri: server.config.bucketURL + '/title/' + pagingToken,
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            assert.contentType(res, 'application/json');
            if (!res.body.items || !res.body.items.length) {
                throw new Error("Empty listing result!");
            }
        });
    });

    //it('should return a new wikitext revision using proxy handler with id 624165266', function() {
    //    this.timeout(20000);
    //    return preq.get({
    //        uri: server.config.baseURL + '/test/Foobar/wikitext/624165266'
    //    })
    //    .then(function(res) {
    //        assert.deepEqual(res.status, 200);
    //    });
    //});
});

describe('page content access', function() {

    var deniedTitle = 'User talk:DivineAlpha%2FQ1 2015 discussions';
    var deniedRev = '645504917';

    this.timeout(30000);

    function contentURI(format) {
        return [server.config.bucketURL, format, deniedTitle, deniedRev].join('/');
    }

    it('should deny access to the HTML of a restricted revision', function() {
        return preq.get({ uri: contentURI('html') }).then(function(res) {
            throw new Error('Expected status 403, but gotten ' + res.status);
        }, function(res) {
            assert.deepEqual(res.status, 403);
        });
    });

    it('should deny access to the same HTML even after re-fetching it', function() {
        return preq.get({
            uri: contentURI('html'),
            headers: { 'cache-control': 'no-cache' }
        }).then(function(res) {
            throw new Error('Expected status 403, but gotten ' + res.status);
        }, function(res) {
            assert.deepEqual(res.status, 403);
        });
    });

    it('Should throw error for invalid title access', function() {
        return preq.get({
            uri: server.config.bucketURL + '/html/[asdf]'
        })
        .then(function() {
            throw new Error('Error should be thrown')
        }, function(e) {
            assert.deepEqual(e.status, 400);
            assert.deepEqual(e.body.detail, 'title-invalid-characters');
        });
    });
});

describe('page content hierarchy', function() {
    this.timeout(20000);
    it('should list available properties', function() {
        return preq.get({
            uri: server.config.bucketURL + '/',
        })
        .then(function(res) {
            assert.deepEqual(res.status, 200);
            if (!res.body.items || res.body.items.indexOf('html') === -1) {
                throw new Error('Expected property listing that includes "html"');
            }
        });
    });
});
