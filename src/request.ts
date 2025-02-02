import { RequestHandler } from './types';
import fetch from 'node-fetch';

const __DEV__ = process.env.NODE_ENV === 'development';

/*
 * Get the headers based on request properties, adds:
 * - Content Type json if a body is set
 * - Authorization if auth token is set
 * @param requestProperties
 * @returns {{}}
 */

const getHeaders = (requestProperties: RequestInit): HeadersInit => {
    const headers = requestProperties.headers || {};
    if (
        'body' in requestProperties &&
        (typeof FormData !== 'undefined' ? !(requestProperties.body instanceof FormData) : true)
    ) {
        if (headers instanceof Headers) {
            if (!headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/json');
            }
        } else if (Array.isArray(headers)) {
            if (!headers.some(header => header[0] === 'Content-Type')) {
                headers.push(['Content-Type', 'application/json']);
            }
        } else {
            if (typeof headers['Content-Type'] === 'undefined') {
                headers['Content-Type'] = 'application/json';
            }
        }
    }
    return headers;
};

/*
 * Execute a request. Body object will be converted to JSON.
 *
 * @param url
 * @param requestProperties
 * @returns {Promise<HandledResponse>} Resolves with response, response body (json parsed, if present). Rejects with an Error if
 * connection fails.
 */

const defaultRequestHandler: RequestHandler = (url, requestProperties = {}, { parseMethod = 'json' } = { }) => {
    if (__DEV__) {
        console.log('Executing request: ' + url);
    }
    requestProperties.headers = getHeaders(requestProperties);
    if (
        typeof requestProperties.body !== 'string' &&
        (typeof FormData !== 'undefined' ? !(requestProperties.body instanceof FormData) : true)
    ) {
        requestProperties.body = JSON.stringify(requestProperties.body);
    }
    return new Promise((resolve, reject) => {
        const onRequestSuccess = (response: Response) => {
            if (__DEV__) {
                console.log(`Request successful (${response.status}): ` + url);
            }
            if (response.status === 204 || response.headers.get('content-length') === '0') {
                // 204: no content
                resolve({
                    response,
                    body: {},
                });
            } else {
                response[parseMethod]().then(
                    (body: any) =>
                        resolve({
                            response,
                            body,
                        }),
                    err => {
                        if (__DEV__) {
                            console.warn(`Could not parse ${parseMethod} response of ${url}`);
                        }
                        resolve({
                            response,
                            body: err,
                        });
                    }
                );
            }
        };

        const onRequestError = (error: any) => {
            if (__DEV__) {
                console.log(`Request failed: ${url}`);
            }
            reject(error);
        };
        fetch(url, requestProperties).then(onRequestSuccess, onRequestError);
    });
};

export default defaultRequestHandler;
