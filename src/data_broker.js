"use strict";

//TODO: this needs to be moved to binding since it relys on a ton of native web funcationality - fetch, FormData, encodeURIComponent, etc..

import ApplicationState from 'applicationstate';


/**
 * Data broker class, handles communication to the server and returns a promise.
 * Thin wrapper around fetch api.
 * Adds credentials to all requests.
 * Eventual expansion to support caching, etc...
 */
class Broker {

    static config = new class {
        get base_url(){return Broker._base_url}
        set base_url(value) {
            Broker._base_url = value;
            if(Broker._instance)
                Broker._instance = new Broker();
        }
        /** @type {DefaultOptions} */
        get default_options() {
            if(!Broker._default_options)
                Broker._default_options = {
                    get: {
                        blob: false,
                        arraybuffer: false,
                        cache: false,
                        timing: false,
                        credentials: 'include'
                    },
                    put: {
                        json: false,
                        multipart: false,
                        credentials: 'include'
                    },
                    post: {
                        json: false,
                        multipart: false,
                        credentials: 'include'
                    },
                    patch: {
                        json: false,
                        multipart: false,
                        credentials: 'include'
                    },
                    del: {
                        credentials: 'include'
                    }
                }

            return Broker._default_options
        }

        /**
         * @typedef {Object} DefaultOptions default options
         * @property {Object} DefaultOptions.get default options for get requests
         * @property {Object} DefaultOptions.get.blob fetch results as a blob
         * @property {Object} DefaultOptions.get.arraybuffer fetch results as an arraybuffer
         * @property {Object} DefaultOptions.get.cache allow caching
         * @property {Object} DefaultOptions.get.timing include server timing
         * @property {Object} DefaultOptions.get.credentials how/whether credentials and cookies should be included
         * @property {Object} DefaultOptions.put default options for put
         * @property {Object} DefaultOptions.put.json whether put payload is application/json
         * @property {Object} DefaultOptions.put.multipart whether put body is multipart form
         * @property {Object} DefaultOptions.put.credentials how/whether credentials and cookies should be included
         * @property {Object} DefaultOptions.post default options for post
         * @property {Object} DefaultOptions.post.json whether post payload is application/json
         * @property {Object} DefaultOptions.post.credentials how/whether credentials and cookies should be included
         * @property {Object} DefaultOptions.patch default options for patch
         * @property {Object} DefaultOptions.patch.json whether patch payload is application/json
         * @property {Object} DefaultOptions.patch.multipart whether patch body is multipart form
         * @property {Object} DefaultOptions.patch.credentials how/whether credentials and cookies should be included
         * @property {Object} DefaultOptions.del default options for delete
         * @property {Object} DefaultOptions.del.credentials how/whether credentials and cookies should be included
         * 
         */
        set default_options(value) {
            Broker._default_options = value;
        }
    }

    /** Provide a singleton pattern, if needed */
    static getInstance() {
        if (!Broker._instance)
            Broker._instance = new Broker();
        return Broker._instance;
    }

    constructor(base_url) {
        let global_base_url = Broker._base_url;
        this.base_url = base_url || global_base_url || '';
    }

    addEventListener(event_name, listener) {
        if (!this._listeners)
            this._listeners = {};
        if (!this._listeners[event_name])
            this._listeners[event_name] = [];
        this._listeners[event_name].push(listener);
    }

    dispatchEvent(event_name, data) {
        if (!(this._listeners && this._listeners[event_name] && this._listeners[event_name].length))
            return;

        this._listeners[event_name].forEach(
            (listener) => listener(data)
        );
    }

    /**
     * Serialize an object to form data for multipart/form-data
     * @param object
     * @returns {string}
     */
    objectToFormData(object) {
        if ((object === undefined) || (object === null)) return '';
        if (typeof object !== 'object') return '';

        let form_data = new FormData();

        Object.keys(object).forEach(
            key => {
                    let val = object[key];
                    if (typeof val !== 'string') {
                        if(typeof val == 'FileList')
                            for(let file of val)
                                form_data.append(key,file);
                        else if(typeof val == 'File')
                            form_data.set(key, val);
                        else
                            form_data.set(key, JSON.stringify(val));
                }
        });
        return form_data;
    }

    serializeParams(params) {
        if(!params)
            return '';
        let serialized = Object.keys(params)
            .map(
                key => {
                    let val = params[key];
                    if (typeof val !== 'string') {
                        val = JSON.stringify(val);
                    }
                    return [key, val].map(encodeURIComponent)
                        .join("=")
                }
                ).join("&");  
        return serialized;
    }

    getBody(data, options) {
        let body = "";
        if (typeof data === 'string')
            body = data;
        if (typeof data === 'object' && options.json)
            body = JSON.stringify(data);
        if (typeof data === 'object' && (!options.json)) {
            if (options.multipart) {
                body = this.objectToFormData(data);
            }
            else {
                body = this.serializeParams(data);
            }
        }

        return body;
    }

    /**
     * Issue http GET, returns promise
     * @param url
     * @param data
     * @returns {*}
     */
    async get(url, data, options) {
        options = Object.assign(Broker.config.default_options.get, options);
        this.dispatchEvent('loading');
        try {

            if(options.timing) console.time('broker-get-serialize-params');
            let query_string = this.serializeParams(data);
            if (data) query_string = "?" + query_string;
            let get_url = this.base_url + url + query_string;
            if(options.timing) console.timeEnd('broker-get-serialize-params');
            if(options.timing) console.time('broker-get-headers');
            let get_options = {
                    method: 'GET',
                    headers: this.getHeaders({cache: options.cache, blob: options.blob}),
                    credentials: options.credentials
            };
            if(options.timing) console.timeEnd('broker-get-headers');
            if(!options.cache)
                get_options.cache = 'no-store';

            if(options.timing) console.time('broker-get-fetch');
            const response = await fetch(get_url, get_options);
            if(options.timing) console.timeEnd('broker-get-fetch');
            if(options.timing) console.time('broker-get-handle-response');
            let response_body = await this.handleResponse(response, options);
            if(options.timing) console.timeEnd('broker-get-handle-response');
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;
        }
    }

    /**
     * Issue http PUT, returns promise
     * @param url
     * @param data
     * @param serialize_json
     * @returns {*}
     */
    async put(url, data, options) {
        options = Object.assign(Broker.config.default_options.put, options);
        this.dispatchEvent('loading');
        try {
            let put_url = this.base_url + url;
            const response = await fetch(put_url,
                {
                    method: 'PUT',
                    headers: this.getHeaders(options),
                    cache: 'no-store',
                    credentials: options.credentials,
                    body: this.getBody(data, options)
                });

            let response_body = await this.handleResponse(response);
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;
        }
    }

    /**
     * Issue http POST, returns promise
     * @param url
     * @param data
     * @param serialize_json
     * @returns {*}
     */
    async post(url, data, options) {
        options = Object.assign(Broker.config.default_options.post, options);
        this.dispatchEvent('loading');
        try {
            let post_url = this.base_url + url;
            const response = await fetch(post_url,
                {
                    method: 'POST',
                    headers: this.getHeaders(options),
                    cache: 'no-store',
                    credentials: options.credentials,
                    body: this.getBody(data, options)
                });

            let response_body = await this.handleResponse(response);
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;

        }
    }

    /**
     * Send a RFC 6902 compliant json-patch document to the server
     * @param {*} url 
     * @param {*} patch 
     * @param {*} options 
     */
    async patch(url, patch, options) {
        options = Object.assign(Broker.config.default_options.patch, options);
        this.dispatchEvent('loading');
        try {
            let patch_url = this.base_url + url;
            const response = await fetch(patch_url,
                {
                    method: 'PATCH',
                    headers: this.getHeaders(options),
                    cache: 'no-store',
                    credentials: options.credentials,
                    body: this.getBody(patch, options)
                });

            let response_body = await this.handleResponse(response);
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;
        }
    }

    /**
     * Issue http DELETE, returns promise
     *
     * Using the name del instead of delete because 'delete' is a reserved keyword
     * @param url
     * @param data
     * @returns {*}
     */
    async del(url, data, options) {
        options = Object.assign(Broker.config.default_options.del, options);
        this.dispatchEvent('loading');
        try {
            let query_string = data ? this.serialize(data) : "";
            if (data) query_string = "?" + query_string;
            let get_url = this.base_url + url + query_string;
            const response = await fetch(get_url,
                {
                    method: 'DELETE',
                    headers: this.getHeaders(),
                    cache: 'no-store',
                    credentials: options.credentials,
                });

            let response_body = await this.handleResponse(response);
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;

        }
    }

    getHeaders(options) {
        let default_options = {
            json: false,
            multipart: false,
            cache: false,
            client_version: true
        }
        options = Object.assign(default_options, options);
        let content_type = 'application/x-www-form-urlencoded';
        if(options.json)
            content_type = 'application/json';
        if(options.multipart)
            content_type = 'multipart/form-data';

        let header_token = ApplicationState.get('app.jwt') || "";

        let headers = {
            'Content-Type': content_type,
            'Authorization': 'Bearer ' + header_token
        }
        if(!options.blob)
            headers['Accept'] = 'application/json';
        if(!options.cache)
            headers['Cache-Control'] = 'no-cache';
        if(options.client_version)
            headers['client-software-version'] = VERSION;
        return headers;
    }

    async handleResponse(response, options) {
        const status = response.status;
        let body;
        let err;

        switch (status) {
            case 400: //bad request
                body = await response.text();
                err = new Error("400 bad request");
                err.code = status;
                err.body = body;
                throw err;
                break;
            case 401: //forbidden - for missing credentials
                this.dispatchEvent('missing_credentials');
                err = new Error("401 forbidden");
                body = await response.text();
                err.code = status;
                err.body = body;
                break;
            case 403: //unauthorized - don't have permission
                this.dispatchEvent('unauthorized');
                err = new Error("403 unauthorized")
                body = await response.text();
                err.code = status;
                err.body = body;
                break;
            case 409: //client out of date
                this.dispatchEvent('need_update');
                err = new Error("409 out of date");
                body = await response.text();
                err.code = status;
                err.body = body;
                break;
            case 418: //I'm a teapot
                body = await response.text();
                err = new Error("418 I'm a teapot");
                err.code = status;
                err.body = body;
                throw err;
            default: //check for success
                if(options && options.blob)
                    body = await response.blob();
                else if(options && options.arraybuffer)
                    body = await response.arrayBuffer();
                else
                    body = await response.json();
                if (!response.ok) {
                    err = new Error(`${response.status}: ${response.statusText} -- ${JSON.stringify(body)}`);
                    err.code = status;
                    err.body = body;
                    throw err;
                }
                return body;
                break;
        }

    }

}

export {Broker}

export default Broker.getInstance();
